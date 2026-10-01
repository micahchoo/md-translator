import { describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import type { Completion } from '../src/llm'
import { translateDocument, type TranslateOptions } from '../src/translate'

const opts: TranslateOptions = {
  language: LANGUAGES.hi,
  preamble: 'Translate to {L}.',
  examples: [],
  contextBlocks: 2,
  passageLength: 1200,
  retries: 3,
  skipKeys: [],
}

/** The source line a prompt asks about: the last `English:` line. */
const asked = (prompt: string) => prompt.match(/English: (.*)\nHindi:$/)![1]

/** A model that answers from a table, and records every request it was sent. */
function fake(answer: (source: string, attempt: number) => string) {
  const calls: Completion[] = []
  const seen = new Map<string, number>()
  const complete = async (req: Completion, onText: (s: string) => void) => {
    calls.push(req)
    const src = asked(req.prompt)
    const n = seen.get(src) ?? 0
    seen.set(src, n + 1)
    const out = answer(src, n)
    onText(out.slice(0, 2))
    onText(out)
    return out
  }
  return { complete, calls }
}

const TABLE: Record<string, string> = {
  Title: 'शीर्षक',
  'Wash the lemons.': 'नींबू धो लें।',
  'Dry them well.': 'उन्हें अच्छी तरह सुखा लें।',
  'Cut them into 4.': 'उन्हें 4 टुकड़ों में काटें।',
}

describe('translateDocument', () => {
  test('translates every unit and rebuilds the document around them', async () => {
    const { complete } = fake((s) => TABLE[s])
    const r = await translateDocument('# Title\n\n1. Wash the lemons.\n2. Dry them well.\n', opts, complete, () => {})
    expect(r.markdown).toBe('# शीर्षक\n\n1. नींबू धो लें।\n2. उन्हें अच्छी तरह सुखा लें।\n')
    expect(r.units.every((u) => u.flags.length === 0)).toBe(true)
  })

  test('the first attempt is greedy; a flagged unit is retried with sampling and a new seed', async () => {
    const { complete, calls } = fake((s, n) => (n < 2 ? s : TABLE[s])) // echoes English twice
    const r = await translateDocument('Wash the lemons.\n', opts, complete, () => {})
    expect(calls.map((c) => [c.temperature, c.seed])).toEqual([[0, 0], [0.6, 1], [0.6, 2]])
    expect(r.markdown).toBe('नींबू धो लें।\n')
    expect(r.units[0].attempts).toBe(3)
  })

  test('after the last retry it keeps the attempt with the fewest flags and reports them', async () => {
    const outs = ['Wash the lemons.', 'नींबू धो लें। *ध्यान से*', 'नींबू धो लें। **ध्यान से** फिर', 'Wash them.']
    const { complete } = fake((_, n) => outs[n])
    const r = await translateDocument('Wash the lemons.\n', opts, complete, () => {})
    expect(r.units[0].attempts).toBe(4)
    expect(r.units[0].output).toBe('नींबू धो लें। *ध्यान से*')
    expect(r.units[0].flags).toEqual(['markup'])
  })

  test('context is the last clean pairs; a flagged answer never becomes context', async () => {
    const { complete, calls } = fake((s) => (s === 'Dry them well.' ? s : TABLE[s]))
    await translateDocument('Title\n\nWash the lemons.\n\nDry them well.\n\nCut them into 4.\n', { ...opts, retries: 0 }, complete, () => {})
    const last = calls.at(-1)!.prompt
    expect(last).toContain('English: Title\nHindi: शीर्षक')
    expect(last).toContain('English: Wash the lemons.\nHindi: नींबू धो लें।')
    expect(last).not.toContain('English: Dry them well.')
  })

  test('a passage over the length limit is sent in sentence pieces and joined', async () => {
    const { complete, calls } = fake((s) => TABLE[s])
    const r = await translateDocument('Wash the lemons. Dry them well.\n', { ...opts, passageLength: 20 }, complete, () => {})
    expect(calls.map((c) => asked(c.prompt))).toEqual(['Wash the lemons.', 'Dry them well.'])
    expect(r.markdown).toBe('नींबू धो लें। उन्हें अच्छी तरह सुखा लें।\n')
  })

  test('progress is reported while text streams in', async () => {
    const { complete } = fake((s) => TABLE[s])
    const seen: string[] = []
    await translateDocument('Wash the lemons.\n', opts, complete, (p) => seen.push(p.markdown))
    expect(seen).toContain('नी\n')
    expect(seen.at(-1)).toBe('नींबू धो लें।\n')
  })

  test('a stop request ends the run before the next unit', async () => {
    const stop = new AbortController()
    const { complete, calls } = fake((s) => {
      stop.abort()
      return TABLE[s]
    })
    const run = translateDocument('Wash the lemons.\n\nDry them well.\n', opts, complete, () => {}, stop.signal)
    await expect(run).rejects.toThrow('stopped')
    expect(calls.length).toBe(1)
  })
})
