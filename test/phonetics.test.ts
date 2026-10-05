import { describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import { createPronouncer, phonemize } from '../src/phonetics'

// These run the real espeak-ng WASM, the same file the page loads.
describe('phonemize', () => {
  test('a Hindi sentence comes back as IPA', async () => {
    expect(await phonemize('hi', 'यह कैसे काम करता है')).toBe('jˌəh kˈɛːseː kˈaːm kˈʌɾtˌaː hɛː')
  })

  test('Markdown, link targets and code are not read aloud', async () => {
    const plain = await phonemize('hi', 'यह कैसे काम करता है')
    expect(await phonemize('hi', '**यह** कैसे [काम](#1) करता है `npm install`')).toBe(plain)
    expect(await phonemize('hi', '[[#1|यह]] कैसे काम करता है [[#2]]')).toBe(plain)
  })

  test('two sentences come back on one line, with no switch of voice marked', async () => {
    const ipa = await phonemize('hi', 'FDA की रिपोर्ट। दूसरा वाक्य।')
    expect(ipa).not.toContain('\n')
    expect(ipa).not.toMatch(/\([a-z-]+\)/)
  })

  test('a block with no words has no pronunciation', async () => {
    expect(await phonemize('hi', '`npm install` [#1](#1)')).toBe('')
  })

  test('every voice a language names reads its own examples', async () => {
    for (const lang of Object.values(LANGUAGES).filter((l) => l.phonetic)) {
      const [, text] = lang.examples[0] ?? ['', 'How it works']
      expect(await phonemize(lang.phonetic!, text)).toMatch(/\p{L}/u)
    }
  })
})

describe('createPronouncer', () => {
  const deferred = () => {
    const calls: { voice: string; text: string; resolve: (s: string) => void }[] = []
    const fake = (voice: string, text: string) => new Promise<string>((resolve) => calls.push({ voice, text, resolve }))
    return { calls, fake }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0))

  test('answers nothing at first, then the IPA once it is ready', async () => {
    const { calls, fake } = deferred()
    let ready = 0
    const p = createPronouncer(fake, () => ready++)
    expect(p.get('hi', 'नमस्ते')).toBeUndefined()
    await tick()
    calls[0].resolve('nəmˈʌsteː')
    await tick()
    expect(ready).toBe(1)
    expect(p.get('hi', 'नमस्ते')).toBe('nəmˈʌsteː')
  })

  test('asks once per text and voice, one at a time', async () => {
    const { calls, fake } = deferred()
    const p = createPronouncer(fake, () => {})
    p.get('hi', 'एक')
    p.get('hi', 'एक')
    p.get('hi', 'दो')
    await tick()
    expect(calls.map((c) => c.text)).toEqual(['एक'])
    calls[0].resolve('eːk')
    await tick()
    expect(calls.map((c) => c.text)).toEqual(['एक', 'दो'])
  })

  test('a failure answers empty and is not asked again', async () => {
    let asked = 0
    const p = createPronouncer(async () => (asked++, Promise.reject(new Error('offline'))), () => {})
    p.get('hi', 'एक')
    await tick()
    await tick()
    expect(p.get('hi', 'एक')).toBe('')
    expect(asked).toBe(1)
  })
})
