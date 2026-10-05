import { describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import { DEFAULTS, formatExamples, loadSettings, parseExamples, saveSettings, toOptions } from '../src/settings'

function memory(initial?: string) {
  const data = new Map<string, string>(initial ? [['md-translator.settings', initial]] : [])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('loadSettings', () => {
  test('nothing stored gives the defaults', () => {
    expect(loadSettings(memory())).toEqual(DEFAULTS)
  })

  test('a saved setting survives; a missing one falls back to its default', () => {
    const s = memory()
    saveSettings(s, { ...DEFAULTS, endpoint: 'http://192.168.0.5:8086' })
    const loaded = loadSettings(memory(JSON.stringify({ endpoint: 'http://192.168.0.5:8086' })))
    expect(loaded.endpoint).toBe('http://192.168.0.5:8086')
    expect(loaded.passageLength).toBe(DEFAULTS.passageLength)
    expect(loadSettings(s).endpoint).toBe('http://192.168.0.5:8086')
  })

  test('corrupt or unreadable storage gives the defaults instead of a broken page', () => {
    expect(loadSettings(memory('{not json'))).toEqual(DEFAULTS)
    expect(loadSettings({ getItem: () => { throw new Error('blocked') } })).toEqual(DEFAULTS)
  })

  test('the old default preamble, saved before the source could be any language, becomes the new one', () => {
    const old = 'The following are English passages with faithful, complete {L} translations. ' +
      'Every sentence is translated. Markdown syntax, inline code, numbers and names are kept unchanged.'
    expect(loadSettings(memory(JSON.stringify({ preamble: old }))).preamble).toBe(DEFAULTS.preamble)
    expect(loadSettings(memory(JSON.stringify({ preamble: 'Mine.' }))).preamble).toBe('Mine.')
  })

  test('the judge, saved on before it was off by default, is turned off once', () => {
    const before = memory(JSON.stringify({ judge: true, endpoint: 'http://192.168.0.5:8086' }))
    const loaded = loadSettings(before)
    expect(loaded.judge).toBe(false)
    expect(loaded.endpoint).toBe('http://192.168.0.5:8086')
    // Turned on again and saved, it stays on.
    saveSettings(before, { ...loaded, judge: true })
    expect(loadSettings(before).judge).toBe(true)
  })

  test('a value of the wrong type is ignored', () => {
    expect(loadSettings(memory(JSON.stringify({ passageLength: 'long', language: 'xx' })))).toEqual(DEFAULTS)
  })
})

describe('examples as editable text', () => {
  test('format and parse are inverse', () => {
    const text = formatExamples(LANGUAGES.kn.examples, LANGUAGES.kn)
    expect(text.startsWith('English: How it works\nKannada: ')).toBe(true)
    expect(parseExamples(text, LANGUAGES.kn)).toEqual(LANGUAGES.kn.examples)
  })

  test('into English an example pairs an Original line with an English one', () => {
    expect(parseExamples('Original: नमस्ते\nEnglish: Hello', LANGUAGES.en)).toEqual([['नमस्ते', 'Hello']])
  })

  test('a pair missing its translation is refused with its position', () => {
    expect(() => parseExamples('English: One\nHindi: एक\n\nEnglish: Two', LANGUAGES.hi)).toThrow('Example 2')
  })

  test('empty text means no examples', () => {
    expect(parseExamples('  \n', LANGUAGES.hi)).toEqual([])
  })
})

describe('toOptions', () => {
  test('uses the chosen language and its own examples', () => {
    const o = toOptions({ ...DEFAULTS, language: 'kn' })
    expect(o.language.name).toBe('Kannada')
    expect(o.examples).toEqual(LANGUAGES.kn.examples)
  })

  test('skip keys are given as a comma list', () => {
    expect(toOptions({ ...DEFAULTS, skipKeys: 'notion-id, base ,, tags' }).skipKeys).toEqual(['notion-id', 'base', 'tags'])
  })
})
