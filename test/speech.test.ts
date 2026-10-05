import { describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import { speak } from '../src/speech'

// These run the real espeak-ng WASM, the same file the page loads.
const isWav = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(b.slice(8, 12)) === 'WAVE'

describe('speak', () => {
  test('a Hindi sentence comes back as a WAV file', async () => {
    const wav = await speak('hi', 'यह कैसे काम करता है')
    expect(isWav(wav!)).toBe(true)
    expect(wav!.length).toBeGreaterThan(20_000)
  })

  test('Markdown, link targets and code are not read aloud', async () => {
    const plain = await speak('hi', 'यह कैसे काम करता है')
    expect(await speak('hi', '**यह** कैसे [काम](#1) करता है `npm install`')).toEqual(plain)
    expect(await speak('hi', '[[#1|यह]] कैसे काम करता है [[#2]]')).toEqual(plain)
  })

  test('a block with no words has nothing to say', async () => {
    expect(await speak('hi', '`npm install` [#1](#1)')).toBeNull()
  })

  test('every voice a language names reads its own examples', async () => {
    for (const lang of Object.values(LANGUAGES).filter((l) => l.voice)) {
      const [, text] = lang.examples[0] ?? ['', 'How it works']
      const wav = await speak(lang.voice!, text)
      expect(wav && isWav(wav) && wav.length > 20_000).toBe(true)
    }
  })
})
