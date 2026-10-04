// Translates a document one unit at a time, in document order. Each unit's
// first attempt is greedy; a flagged answer is retried by sampling (measured:
// sampling fixed every block a thinking retry fixed, in seconds instead of
// minutes). The best attempt is kept and its flags reported; only clean
// answers become context for the units after them.
import { check, type Flag } from './checks'
import { judgeAnswer, type Score } from './judge'
import { ANY_SOURCE, type Language, type Pair } from './languages'
import type { Complete } from './llm'
import { buildPrompt, cleanOutput, stopFor } from './prompt'
import { assemble, segment, splitPassage, type Unit } from './segment'

export interface TranslateOptions {
  language: Language
  preamble: string
  examples: Pair[]
  /** Scores text for the judge (src/judge.ts); absent where the server cannot. */
  score?: Score
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
  empty: 10, untranslated: 10, script: 10, unrelated: 10, meaning: 10, language: 10, partial: 5, short: 5, truncated: 5, numbers: 5, long: 3, markup: 2,
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

/** How many blocks of a document get the related-language check: a wrong language is the whole document's. */
const LANGUAGE_CHECKS = 3

const judgeOf = (opts: TranslateOptions, score: Score) => ({ score, language: opts.language, preamble: opts.preamble, examples: opts.examples })

/** Every finished unit before `index`, as source and answer, clean or flagged. */
const earlierBefore = (units: UnitResult[], index: number): Pair[] =>
  units.slice(0, index).filter((u) => u.status === 'done' && u.output).map((u) => [u.unit.text, u.output])

/** The clean pairs a unit at `index` may use as context: the finished units before it. */
const historyBefore = (units: UnitResult[], index: number): Pair[] =>
  units.slice(0, index).filter((u) => u.status === 'done' && !u.flags.length && u.output).map((u) => [u.unit.text, u.output])

/**
 * The finished units of an earlier run carried onto the new source by their
 * text, wherever they moved; everything else waits. A stopped run resumes this
 * way, and an edited source keeps the blocks it did not change (Co-op
 * Translator keeps unchanged files for the same reason). The new unit keeps its
 * own links, so a moved link target still lands where the source puts it.
 */
function carryOver(previous: UnitResult[] | undefined, fresh: Unit[]): UnitResult[] {
  const pool = new Map<string, UnitResult[]>()
  for (const u of previous ?? []) if (u.status === 'done' && u.output) pool.set(u.unit.text, [...(pool.get(u.unit.text) ?? []), u])
  return fresh.map((unit) => {
    const old = pool.get(unit.text)?.shift()
    return old ? { ...old, unit } : { unit, output: '', flags: [], attempts: 0, status: 'waiting' }
  })
}

export async function translateDocument(
  md: string,
  opts: TranslateOptions,
  complete: Complete,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
  /** Units from an earlier run; finished ones whose text is still in the source are kept. */
  previous?: UnitResult[],
): Promise<Progress> {
  const units = carryOver(previous, segment(md, { skipKeys: opts.skipKeys }))
  onProgress(progressOf(md, units))
  const history: Pair[] = []
  let languageChecks = 0

  try {
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
      // The judge looks only at blocks the rules passed; the language check at the first few with words to judge.
      if (opts.score && !u.flags.length) {
        const checkLanguage = languageChecks < LANGUAGE_CHECKS && u.output.split(/\s+/).length >= 5
        if (checkLanguage) languageChecks++
        u.flags = await judgeAnswer({ ...judgeOf(opts, opts.score), source: u.unit.text, output: u.output, checkLanguage, signal })
      }
      u.status = 'done'
      onProgress(progressOf(md, units))
    }
  } finally {
    // Stopped or failed in the middle of a block: that block is waiting again, never left running.
    for (const u of units) if (u.status === 'running') u.status = 'waiting'
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
    if (opts.score && !r.flags.length)
      r.flags = await judgeAnswer({ ...judgeOf(opts, opts.score), source: u.unit.text, output: r.output, checkLanguage: before.flags.includes('language'), signal })
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

/**
 * The line a downloaded translation ends with, so whoever receives the file
 * knows a model made it and how much of it a reader still has to check.
 * Co-op Translator ends its translations with a note for the same reason.
 */
export function machineNote(language: Language, model: string, date: string, flagged: number): string {
  const direction = language.from === ANY_SOURCE ? `into ${language.name}` : `from ${language.from} into ${language.name}`
  const check = flagged ? ` ${flagged} ${flagged === 1 ? 'block was' : 'blocks were'} flagged for checking.` : ''
  return `*Machine-translated ${direction} with ${model}, ${date}.${check}*`
}
