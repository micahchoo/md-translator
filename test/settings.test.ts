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

  test('a value of the wrong type is ignored', () => {
    expect(loadSettings(memory(JSON.stringify({ passageLength: 'long', language: 'xx' })))).toEqual(DEFAULTS)
  })
})

describe('examples as editable text', () => {
  test('format and parse are inverse', () => {
    const text = formatExamples(LANGUAGES.kn.examples, 'Kannada')
    expect(text.startsWith('English: How it works\nKannada: ')).toBe(true)
    expect(parseExamples(text, 'Kannada')).toEqual(LANGUAGES.kn.examples)
  })

  test('a pair missing its translation is refused with its position', () => {
    expect(() => parseExamples('English: One\nHindi: एक\n\nEnglish: Two', 'Hindi')).toThrow('Example 2')
  })

  test('empty text means no examples', () => {
    expect(parseExamples('  \n', 'Hindi')).toEqual([])
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
