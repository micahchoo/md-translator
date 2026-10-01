import { describe, expect, test } from 'bun:test'
import { buildPrompt, cleanOutput, DEFAULT_PREAMBLE, STOP } from '../src/prompt'
import { LANGUAGES } from '../src/languages'

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

  test('stops at a blank line or a new English line', () => {
    expect(STOP).toEqual(['\n\n', '\nEnglish:'])
  })
})

describe('languages', () => {
  test('every language has five examples covering a heading, a question, a list label, code and a link', () => {
    for (const lang of Object.values(LANGUAGES)) {
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
  test('trims and drops a leaked example label', () => {
    expect(cleanOutput(' नमस्ते\nEnglish: hi', LANGUAGES.hi)).toBe('नमस्ते')
    expect(cleanOutput('Hindi: नमस्ते', LANGUAGES.hi)).toBe('नमस्ते')
  })
})
