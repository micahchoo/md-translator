// Translates a document one unit at a time, in document order. Each unit's
// first attempt is greedy; a flagged answer is retried by sampling (measured:
// sampling fixed every block a thinking retry fixed, in seconds instead of
// minutes). The best attempt is kept and its flags reported; only clean
// answers become context for the units after them.
import { check, type Flag } from './checks'
import type { Language, Pair } from './languages'
import type { Complete } from './llm'
import { buildPrompt, cleanOutput, stopFor } from './prompt'
import { assemble, segment, splitPassage, type Unit } from './segment'

export interface TranslateOptions {
  language: Language
  preamble: string
  examples: Pair[]
  /** The owner's earlier edits for this language, by source block: used as they are, never asked again. */
  remembered?: Record<string, string>
  /** Set when the examples are another language's; see `PromptInput.exampleLabel`. */
  exampleLabel?: string
  /** How many preceding clean pairs the model sees. */
  contextBlocks: number
  /** Longest passage sent in one request, in characters. */
  passageLength: number
  /** Extra attempts after a flagged first answer. */
  retries: number
  skipKeys: string[]
}

export interface UnitResult {
  unit: Unit
  output: string
  flags: Flag[]
  attempts: number
  status: 'waiting' | 'running' | 'done'
  /** The owner wrote this output by hand. */
  edited?: boolean
}

export interface Progress {
  markdown: string
  units: UnitResult[]
}

// How bad a flag is when choosing among failed attempts: lost meaning first.
const WEIGHT: Record<Flag, number> = {
  empty: 10, untranslated: 10, script: 10, unrelated: 10, partial: 5, short: 5, truncated: 5, numbers: 5, long: 3, markup: 2,
}
const cost = (flags: Flag[]) => flags.reduce((s, f) => s + WEIGHT[f], 0)

/** The document as it stands: finished units translated, the rest as written. */
export function progressOf(md: string, units: UnitResult[]): Progress {
  return { markdown: assemble(md, units.map((u) => u.unit), units.map((u) => u.output || u.unit.text)), units }
}

interface Attempts {
  /** Sampling only, as for a retry the owner asked for; otherwise greedy first. */
  sampleFirst: boolean
}

/**
 * Translates one unit piece by piece, streaming into `u.output` through
 * `onText`, and returns the best answer. Clean pieces are appended to `history`.
 */
async function translateUnit(
  u: UnitResult,
  history: Pair[],
  /** Every block before this one, flagged or clean: an answer repeated from one is not this block's. */
  earlier: Pair[],
  opts: TranslateOptions,
  complete: Complete,
  onText: () => void,
  signal: AbortSignal | undefined,
  how: Attempts,
): Promise<{ output: string; flags: Flag[] }> {
  const done: string[] = []
  const flags = new Set<Flag>()
  for (const piece of splitPassage(u.unit.text, opts.passageLength)) {
    const prompt = buildPrompt({
      language: opts.language,
      preamble: opts.preamble,
      examples: opts.examples,
      exampleLabel: opts.exampleLabel,
      context: opts.contextBlocks > 0 ? history.slice(-opts.contextBlocks) : [],
      source: piece,
    })
    let best: { output: string; flags: Flag[] } | null = null
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      if (signal?.aborted) throw new Error('stopped')
      const greedy = attempt === 0 && !how.sampleFirst
      const raw = await complete(
        { prompt, temperature: greedy ? 0 : 0.6, seed: u.attempts, maxTokens: Math.max(256, piece.length * 2), stop: stopFor(opts.language) },
        (soFar) => {
          u.output = [...done, cleanOutput(soFar, opts.language)].join(' ')
          onText()
        },
        signal,
      )
      u.attempts++
      const output = cleanOutput(raw, opts.language)
      const f = check(piece, output, opts.language, [...opts.examples, ...earlier])
      if (!best || cost(f) < cost(best.flags)) best = { output, flags: f }
      if (f.length === 0) break
    }
    done.push(best!.output)
    best!.flags.forEach((f) => flags.add(f))
    if (best!.flags.length === 0) history.push([piece, best!.output])
  }
  return { output: done.join(' '), flags: [...flags] }
}

/** Every finished unit before `index`, as source and answer, clean or flagged. */
const earlierBefore = (units: UnitResult[], index: number): Pair[] =>
  units.slice(0, index).filter((u) => u.status === 'done' && u.output).map((u) => [u.unit.text, u.output])

/** The clean pairs a unit at `index` may use as context: the finished units before it. */
const historyBefore = (units: UnitResult[], index: number): Pair[] =>
  units.slice(0, index).filter((u) => u.status === 'done' && !u.flags.length && u.output).map((u) => [u.unit.text, u.output])

const sameUnits = (a: UnitResult[], b: Unit[]) =>
  a.length === b.length && a.every((u, i) => u.unit.text === b[i].text && u.unit.start === b[i].start)

export async function translateDocument(
  md: string,
  opts: TranslateOptions,
  complete: Complete,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
  /** Units from an earlier run of the same source; finished ones are kept. */
  previous?: UnitResult[],
): Promise<Progress> {
  const fresh = segment(md, { skipKeys: opts.skipKeys })
  const units: UnitResult[] =
    previous && sameUnits(previous, fresh)
      ? previous.map((u) => (u.status === 'done' ? { ...u } : { unit: u.unit, output: '', flags: [], attempts: 0, status: 'waiting' }))
      : fresh.map((unit) => ({ unit, output: '', flags: [], attempts: 0, status: 'waiting' }))
  const history: Pair[] = []

  for (const [i, u] of units.entries()) {
    if (u.status === 'done') {
      if (!u.flags.length && u.output) history.push([u.unit.text, u.output])
      continue
    }
    if (signal?.aborted) throw new Error('stopped')
    const kept = opts.remembered?.[u.unit.text]
    if (kept !== undefined) {
      // The owner's own words: checked so a lost link still shows, then trusted as context.
      Object.assign(u, { output: kept, flags: check(u.unit.text, kept, opts.language, earlierBefore(units, i)), edited: true, status: 'done' })
      if (!u.flags.length) history.push([u.unit.text, kept])
      onProgress(progressOf(md, units))
      continue
    }
    u.status = 'running'
    const r = await translateUnit(u, history, earlierBefore(units, i), opts, complete, () => onProgress(progressOf(md, units)), signal, {
      sampleFirst: false,
    })
    u.output = r.output
    u.flags = r.flags
    u.status = 'done'
    onProgress(progressOf(md, units))
  }
  return progressOf(md, units)
}

/**
 * Asks again for one block, by sampling: the greedy answer is what is there
 * already. The new answer replaces the block unless every attempt was worse.
 */
export async function retryUnit(
  md: string,
  units: UnitResult[],
  index: number,
  opts: TranslateOptions,
  complete: Complete,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<Progress> {
  const u = units[index]
  const before = { output: u.output, flags: u.flags, edited: u.edited }
  u.status = 'running'
  try {
    const r = await translateUnit(u, historyBefore(units, index), earlierBefore(units, index), opts, complete, () => onProgress(progressOf(md, units)), signal, {
      sampleFirst: true,
    })
    if (cost(r.flags) > cost(before.flags)) Object.assign(u, before)
    else Object.assign(u, { output: r.output, flags: r.flags, edited: false })
  } catch (e) {
    Object.assign(u, before)
    throw e
  } finally {
    u.status = 'done'
  }
  return progressOf(md, units)
}

/** The owner's own text for one block. It is still checked, so a lost link shows. */
export function editUnit(md: string, units: UnitResult[], index: number, text: string, language: Language): Progress {
  const u = units[index]
  u.output = text.trim()
  u.flags = check(u.unit.text, u.output, language, earlierBefore(units, index))
  u.edited = true
  u.status = 'done'
  return progressOf(md, units)
}
