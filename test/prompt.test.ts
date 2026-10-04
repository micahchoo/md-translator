import { describe, expect, test } from 'bun:test'
import { buildPrompt, cleanOutput, DEFAULT_PREAMBLE, stopFor } from '../src/prompt'
import { directionLabel, LANGUAGES } from '../src/languages'

describe('buildPrompt', () => {
  test('is parallel text: preamble, examples, context, then the open source line', () => {
    const p = buildPrompt({
      language: LANGUAGES.hi,
      preamble: 'English passages with complete {L} translations.',
      examples: [['How it works', 'यह कैसे काम करता है']],
      context: [['Recipe', 'रेसिपी']],
      source: 'Wash the lemons.',
    })
    expect(p).toBe(
      'English passages with complete Hindi translations.\n\n' +
        'English: How it works\nHindi: यह कैसे काम करता है\n\n' +
        'English: Recipe\nHindi: रेसिपी\n\n' +
        'English: Wash the lemons.\nHindi:',
    )
  })

  test('uses no chat template, so the model has no turn to think in', () => {
    const p = buildPrompt({ language: LANGUAGES.kn, preamble: DEFAULT_PREAMBLE, examples: LANGUAGES.kn.examples, context: [], source: 'x' })
    expect(p).not.toMatch(/<\|.*?\|>|<think>/)
    expect(p.endsWith('English: x\nKannada:')).toBe(true)
  })

  test('the default preamble names no genre', () => {
    expect(DEFAULT_PREAMBLE).not.toMatch(/technical|policy|recipe/i)
  })

  test('borrowed examples keep their own language label', () => {
    const p = buildPrompt({
      language: LANGUAGES.te, preamble: 'P', examples: [['How it works', 'यह कैसे काम करता है']], exampleLabel: 'Hindi',
      context: [['Install', 'ఇన్‌స్టాల్']], source: 'x',
    })
    expect(p).toBe('P\n\nEnglish: How it works\nHindi: यह कैसे काम करता है\n\nEnglish: Install\nTelugu: ఇన్‌స్టాల్\n\nEnglish: x\nTelugu:')
  })

  test('stops at a blank line or a new source line', () => {
    expect(stopFor(LANGUAGES.hi)).toEqual(['\n\n', '\nEnglish:'])
    expect(stopFor(LANGUAGES.en)).toEqual(['\n\n', '\nOriginal:'])
  })

  test('into English the source is not named, so the model detects its language', () => {
    const p = buildPrompt({ language: LANGUAGES.en, preamble: DEFAULT_PREAMBLE, examples: [], context: [], source: 'नमस्ते' })
    expect(p).toBe('The following are Original passages with faithful, complete English translations. ' +
      'Every sentence is translated. Markdown syntax, inline code, numbers and names are kept unchanged.\n\n' +
      'Original: नमस्ते\nEnglish:')
  })
})

describe('languages', () => {
  test('each language names its direction, for the picker', () => {
    expect(directionLabel(LANGUAGES.hi)).toBe('English → Hindi')
    expect(directionLabel(LANGUAGES.en)).toBe('Any language → English')
  })

  test('a language with examples has five, covering a heading, a question, a list label, code and a link', () => {
    for (const lang of Object.values(LANGUAGES)) {
      if (!lang.examples.length) continue // admitted without any; see languages.ts
      expect(lang.examples.length).toBe(5)
      const en = lang.examples.map(([e]) => e).join('\n')
      expect(en).toContain('?')
      expect(en).toContain('**')
      expect(en).toContain('`')
      expect(en).toContain('](#1)')
    }
  })

  test('no example is about recipes', () => {
    for (const lang of Object.values(LANGUAGES))
      expect(lang.examples.flat().join(' ')).not.toMatch(/pickle|masala|recipe|chilly|lemon/i)
  })
})

describe('cleanOutput', () => {
  test('keeps zero-width joiners at the edges and inside', () => {
    expect(cleanOutput(' ‌ಆಫ್‌ಲೈನ್‍ ', LANGUAGES.kn)).toBe('‌ಆಫ್‌ಲೈನ್‍')
  })

  test('trims and drops a leaked example label', () => {
    expect(cleanOutput(' नमस्ते\nEnglish: hi', LANGUAGES.hi)).toBe('नमस्ते')
    expect(cleanOutput('Hindi: नमस्ते', LANGUAGES.hi)).toBe('नमस्ते')
    expect(cleanOutput(' Hello\nOriginal: नमस्ते', LANGUAGES.en)).toBe('Hello')
  })
})
