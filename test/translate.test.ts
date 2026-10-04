import { describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import type { Completion } from '../src/llm'
import { editUnit, machineNote, retryUnit, translateDocument, type Progress, type TranslateOptions } from '../src/translate'

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
    const outs = ['Wash the lemons.', 'नींबू *धो* लें।', 'नींबू **धो** लें। फिर उन्हें सुखा लें।', 'Wash them.']
    const { complete } = fake((_, n) => outs[n])
    const r = await translateDocument('Wash the lemons.\n', opts, complete, () => {})
    expect(r.units[0].attempts).toBe(4)
    expect(r.units[0].output).toBe('नींबू *धो* लें।')
    expect(r.units[0].flags).toEqual(['markup'])
  })

  test('a block the owner edited before is not asked again, and serves as context', async () => {
    const { complete, calls } = fake((s) => TABLE[s])
    const remembered = { 'Wash the lemons.': 'नींबू अच्छे से धो लें।' }
    const r = await translateDocument('Wash the lemons.\n\nDry them well.\n', { ...opts, remembered }, complete, () => {})
    expect(r.units[0]).toMatchObject({ output: 'नींबू अच्छे से धो लें।', edited: true, flags: [] })
    expect(calls.map((c) => asked(c.prompt))).toEqual(['Dry them well.'])
    expect(calls[0].prompt).toContain('English: Wash the lemons.\nHindi: नींबू अच्छे से धो लें।')
  })

  test('an answer repeated for a different block is flagged, flagged or not the first time', async () => {
    // Telugu, bench/starts.ts: the same word came back for the first two blocks.
    const { complete } = fake(() => 'नींबू')
    const r = await translateDocument('Title\n\nWash the lemons.\n', opts, complete, () => {})
    expect(r.units[0].flags).not.toContain('unrelated')
    expect(r.units[1].flags).toContain('unrelated')
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
  test('a run stopped in the middle of a block leaves that block waiting, not running', async () => {
    const stop = new AbortController()
    let last: Progress | undefined
    const complete = async () => {
      stop.abort()
      throw new Error('stopped')
    }
    await expect(translateDocument('Wash the lemons.\n', opts, complete, (p) => (last = p), stop.signal)).rejects.toThrow('stopped')
    expect(last!.units.map((u) => u.status)).toEqual(['waiting'])
  })
})

describe('resume', () => {
  test('finished units are kept, not asked again, and serve as context', async () => {
    const md = 'Wash the lemons.\n\nDry them well.\n'
    const done = await translateDocument(md, opts, fake((s) => TABLE[s]).complete, () => {})
    const stopped = [done.units[0], { ...done.units[1], status: 'waiting' as const, output: '', flags: [], attempts: 0 }]
    const { complete, calls } = fake((s) => TABLE[s])
    const resumed = await translateDocument(md, opts, complete, () => {}, undefined, stopped)
    expect(calls.map((c) => asked(c.prompt))).toEqual(['Dry them well.'])
    expect(calls[0].prompt).toContain('English: Wash the lemons.\nHindi: नींबू धो लें।')
    expect(resumed.markdown).toBe('नींबू धो लें।\n\nउन्हें अच्छी तरह सुखा लें।\n')
  })

  test('saved units that no longer match the source are ignored', async () => {
    const old = await translateDocument('Wash the lemons.\n', opts, fake((s) => TABLE[s]).complete, () => {})
    const { complete, calls } = fake((s) => TABLE[s])
    await translateDocument('Dry them well.\n', opts, complete, () => {}, undefined, old.units)
    expect(calls.map((c) => asked(c.prompt))).toEqual(['Dry them well.'])
  })
  test('an edited source keeps the blocks that did not change, wherever they moved', async () => {
    const old = await translateDocument('Wash the lemons.\n\nDry them well.\n', opts, fake((s) => TABLE[s]).complete, () => {})
    const { complete, calls } = fake((s) => TABLE[s])
    const r = await translateDocument('Title\n\nWash the lemons.\n', opts, complete, () => {}, undefined, old.units)
    expect(calls.map((c) => asked(c.prompt))).toEqual(['Title'])
    expect(r.markdown).toBe('शीर्षक\n\nनींबू धो लें।\n')
  })
})

describe('retryUnit', () => {
  const md = 'Wash the lemons.\n\nDry them well.\n\nCut them into 4.\n'

  test('samples a new answer for one block, with the clean blocks before it as context', async () => {
    const done = await translateDocument(md, opts, fake((s) => TABLE[s]).complete, () => {})
    const tried = done.units[1].attempts
    const { complete, calls } = fake(() => 'उन्हें सुखा लें।')
    const r = await retryUnit(md, done.units, 1, opts, complete, () => {})
    expect(calls).toHaveLength(1)
    expect([calls[0].temperature, calls[0].seed]).toEqual([0.6, tried])
    expect(calls[0].prompt).toContain('English: Wash the lemons.\nHindi: नींबू धो लें।')
    expect(calls[0].prompt).not.toContain('English: Cut them into 4.')
    expect(r.markdown).toBe('नींबू धो लें।\n\nउन्हें सुखा लें।\n\nउन्हें 4 टुकड़ों में काटें।\n')
    expect(r.units[1].edited).toBeFalsy()
  })

  test('keeps what is there when every new attempt is worse', async () => {
    const done = await translateDocument(md, opts, fake((s) => TABLE[s]).complete, () => {})
    const r = await retryUnit(md, done.units, 0, opts, fake((s) => s).complete, () => {})
    expect(r.units[0].output).toBe('नींबू धो लें।')
    expect(r.units[0].flags).toEqual([])
  })
})

describe('editUnit', () => {
  test('the owner’s text replaces the block, is marked edited, and is still checked', async () => {
    const md = 'See [the docs](https://x.y) first.\n'
    const done = await translateDocument(md, opts, fake(() => 'पहले [डॉक्स](#1) देखें।').complete, () => {})
    const r = editUnit(md, done.units, 0, 'पहले डॉक्स देखें।', opts.language)
    expect(r.markdown).toBe('पहले डॉक्स देखें।\n')
    expect(r.units[0].edited).toBe(true)
    expect(r.units[0].flags).toEqual(['markup'])
  })
})

describe('machineNote', () => {
  test('says what made the translation, and how many blocks still need a reader', () => {
    expect(machineNote(LANGUAGES.ta, 'sarvam-30b', '2026-10-04', 2)).toBe(
      '*Machine-translated from English into Tamil with sarvam-30b, 2026-10-04. 2 blocks were flagged for checking.*',
    )
    expect(machineNote(LANGUAGES.en, 'sarvam-30b', '2026-10-04', 0)).toBe('*Machine-translated into English with sarvam-30b, 2026-10-04.*')
    expect(machineNote(LANGUAGES.hi, 'sarvam-30b', '2026-10-04', 1)).toContain('1 block was flagged')
  })
})
