// Translates a document one unit at a time, in document order. Each unit's
// first attempt is greedy; a flagged answer is retried by sampling (measured:
// sampling fixed every block a thinking retry fixed, in seconds instead of
// minutes). The best attempt is kept and its flags reported; only clean
// answers become context for the units after them.
import { check, type Flag } from './checks'
import type { Language, Pair } from './languages'
import type { Complete } from './llm'
import { buildPrompt, cleanOutput, STOP } from './prompt'
import { assemble, segment, splitPassage, type Unit } from './segment'

export interface TranslateOptions {
  language: Language
  preamble: string
  examples: Pair[]
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
}

export interface Progress {
  markdown: string
  units: UnitResult[]
}

// How bad a flag is when choosing among failed attempts: lost meaning first.
const WEIGHT: Record<Flag, number> = {
  empty: 10, untranslated: 10, partial: 5, short: 5, truncated: 5, numbers: 5, long: 3, markup: 2,
}
const cost = (flags: Flag[]) => flags.reduce((s, f) => s + WEIGHT[f], 0)

export async function translateDocument(
  md: string,
  opts: TranslateOptions,
  complete: Complete,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<Progress> {
  const units: UnitResult[] = segment(md, { skipKeys: opts.skipKeys }).map((unit) => ({
    unit, output: '', flags: [], attempts: 0, status: 'waiting',
  }))
  const snapshot = (): Progress => ({
    markdown: assemble(md, units.map((u) => u.unit), units.map((u) => u.output || u.unit.text)),
    units,
  })
  const history: Pair[] = []

  for (const u of units) {
    if (signal?.aborted) throw new Error('stopped')
    u.status = 'running'
    const done: string[] = []
    const flags = new Set<Flag>()
    for (const piece of splitPassage(u.unit.text, opts.passageLength)) {
      const prompt = buildPrompt({
        language: opts.language,
        preamble: opts.preamble,
        examples: opts.examples,
        context: opts.contextBlocks > 0 ? history.slice(-opts.contextBlocks) : [],
        source: piece,
      })
      let best: { output: string; flags: Flag[] } | null = null
      for (let attempt = 0; attempt <= opts.retries; attempt++) {
        if (signal?.aborted) throw new Error('stopped')
        u.attempts++
        const raw = await complete(
          { prompt, temperature: attempt === 0 ? 0 : 0.6, seed: attempt, maxTokens: Math.max(256, piece.length * 2), stop: STOP },
          (soFar) => {
            u.output = [...done, cleanOutput(soFar, opts.language)].join(' ')
            onProgress(snapshot())
          },
          signal,
        )
        const output = cleanOutput(raw, opts.language)
        const f = check(piece, output, opts.language)
        if (!best || cost(f) < cost(best.flags)) best = { output, flags: f }
        if (f.length === 0) break
      }
      done.push(best!.output)
      best!.flags.forEach((f) => flags.add(f))
      if (best!.flags.length === 0) history.push([piece, best!.output])
      u.output = done.join(' ')
    }
    u.flags = [...flags]
    u.status = 'done'
    onProgress(snapshot())
  }
  return snapshot()
}
