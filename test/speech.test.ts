import { afterEach, describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import { fetchVoice, idsOf, phonemes, PIPER_VOICES, removeVoices, speak, storedVoices, wavOf } from '../src/speech'

// These run the real espeak-ng WASM, the same file the page loads. Piper's
// voices come from Hugging Face, so its tests stop at the ids: CI stays offline.
const ascii = (b: Uint8Array, at: number) => new TextDecoder().decode(b.slice(at, at + 4))
const isWav = (b: Uint8Array) => ascii(b, 0) === 'RIFF' && ascii(b, 8) === 'WAVE'

describe('speak, with espeak-ng alone', () => {
  test('a Hindi sentence comes back as a WAV file', async () => {
    const wav = await speak({ espeak: 'hi' }, 'यह कैसे काम करता है')
    expect(isWav(wav!)).toBe(true)
    expect(wav!.length).toBeGreaterThan(20_000)
  })

  test('Markdown, link targets and code are not read aloud', async () => {
    const plain = await speak({ espeak: 'hi' }, 'यह कैसे काम करता है')
    expect(await speak({ espeak: 'hi' }, '**यह** कैसे [काम](#1) करता है `npm install`')).toEqual(plain)
    expect(await speak({ espeak: 'hi' }, '[[#1|यह]] कैसे काम करता है [[#2]]')).toEqual(plain)
  })

  test('a block with no words has nothing to say', async () => {
    expect(await speak({ espeak: 'hi' }, '`npm install` [#1](#1)')).toBeNull()
  })

  test("every language's rules read its own examples", async () => {
    for (const lang of Object.values(LANGUAGES).filter((l) => l.voice)) {
      const [, text] = lang.examples[0] ?? ['', 'How it works']
      const wav = await speak({ espeak: lang.voice!.espeak }, text)
      expect(wav && isWav(wav) && wav.length > 20_000).toBe(true)
    }
  })

  test('every Piper voice a language names is one the page knows', () => {
    for (const lang of Object.values(LANGUAGES)) if (lang.voice?.piper) expect(PIPER_VOICES).toHaveProperty(lang.voice.piper)
  })

  test('every Piper voice is pinned to a commit, so its URL never serves another file', () => {
    for (const [name, { url }] of Object.entries(PIPER_VOICES)) expect(url).toMatch(new RegExp(`^https://huggingface\\.co/[^/]+/[^/]+/resolve/[0-9a-f]{40}/(.+/)?${name}$`))
  })
})

describe('phonemes: the IPA a Piper voice is given', () => {
  test('keeps the pause a comma and a full stop make', async () => {
    // espeak-ng writes ẽ as e and a combining tilde; compare the letters, not the encoding.
    expect((await phonemes('hi', 'पढ़ें, फिर आगे बढ़ें।')).normalize()).toBe('pˈʌr.hẽː, pʰˈɪɾ ˈaːɡeː bˈʌr.hẽː.')
  })

  test("reads Urdu's question mark and full stop", async () => {
    // A "." inside a word is espeak-ng's syllable break, not a full stop.
    expect(await phonemes('ur', 'یہ کیسے کام کرتا ہے؟ سیٹ اپ گائیڈ پڑھیں۔')).toMatch(/^[^?]+ hɛ\? [^?]+\.$/)
  })

  test('reads a clause that is only a number', async () => {
    // "2003, 2004, 2005 in the year": each year is its own clause.
    expect(await phonemes('kn', '೨೦೦೩, ೨೦೦೪, ೨೦೦೫ ಇಸವಿಯಲ್ಲಿ')).toMatch(/^ˈeɹɐɖu sˈaːviɹˌɐdɐ mˈuːɹu, .*nˈaːlku, /)
  })

  test('reads a number with separators or a decimal point whole', async () => {
    for (const n of ['1,000', '1,00,000', '3.14']) expect(await phonemes('en', n)).not.toMatch(/[,.] /)
    expect(await phonemes('en', 'Now, 3.14 is pi.')).toBe(`${await phonemes('en', 'Now,')} ${await phonemes('en', '3.14 is pi.')}`)
  })

  test('a Markdown mark removed never joins the words on either side', async () => {
    expect(await phonemes('en', '3*4')).toBe(await phonemes('en', '3 4'))
    expect(await phonemes('en', 'snake_case')).toBe(await phonemes('en', 'snake case'))
  })

  test('reads no Markdown, and marks no switch of voice', async () => {
    expect(await phonemes('hi', '**यह** [काम](#1)')).toBe(await phonemes('hi', 'यह काम'))
    expect(await phonemes('hi', 'FDA की रिपोर्ट')).not.toMatch(/\([a-z-]+\)/)
  })
})

describe('idsOf', () => {
  const map = { '^': [1], _: [0], $: [2], a: [5], e: [6], '̃': [7] }

  test('frames each phoneme with padding, between a start and an end', () => {
    expect(idsOf('aa', map)).toEqual([1, 0, 5, 0, 5, 0, 2])
  })

  test('splits a nasal vowel into its letter and its mark, as the voices were trained', () => {
    expect(idsOf('ẽ', map)).toEqual([1, 0, 6, 0, 7, 0, 2])
  })

  test('leaves out a symbol the voice does not know', () => {
    expect(idsOf('axa', map)).toEqual([1, 0, 5, 0, 5, 0, 2])
  })
})

describe('wavOf', () => {
  test('writes 16-bit mono at the given rate, clipping what is too loud', () => {
    const wav = wavOf(new Float32Array([0, 0.5, -2]), 22050)
    const view = new DataView(wav.buffer)
    expect(isWav(wav)).toBe(true)
    expect(view.getUint32(24, true)).toBe(22050)
    expect(view.getUint16(34, true)).toBe(16)
    expect(wav.length).toBe(44 + 3 * 2)
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([0, 16384, -32767])
  })
})

// Cache Storage and the network, as the page has them, held in memory. Each
// test starts from an empty browser: the page opens its cache once.
async function fakeBrowser() {
  const stores = new Map<string, Map<string, Response>>()
  const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!
  const keyOf = (r: RequestInfo | URL) => (typeof r === 'string' ? r : r instanceof URL ? r.href : r.url)
  globalThis.caches = {
    open: async (name: string) => {
      const s = store(name)
      return {
        match: async (r: RequestInfo) => s.get(keyOf(r))?.clone(),
        put: async (r: RequestInfo, res: Response) => void s.set(keyOf(r), res),
        delete: async (r: RequestInfo) => s.delete(keyOf(r)),
        keys: async () => [...s.keys()].map((u) => new Request(u)),
      } as unknown as Cache
    },
    delete: async (name: string) => stores.delete(name),
  } as unknown as CacheStorage
  const fetched: string[] = []
  let serve = (url: string) => new Response(url.endsWith('.json') ? '{"num_speakers":1}' : new Uint8Array(PIPER_VOICES[nameOf(url)].bytes))
  globalThis.fetch = (async (r: RequestInfo | URL) => (fetched.push(keyOf(r)), serve(keyOf(r)))) as typeof fetch
  await removeVoices()
  return { stores, fetched, serveWith: (f: typeof serve) => void (serve = f) }
}
const nameOf = (url: string) => url.split('/').pop()!.replace(/\.onnx(\.json)?$/, '')
const voice = 'ne_NP-chitwan-medium'

describe('the voices kept in this browser', () => {
  const realFetch = globalThis.fetch
  afterEach(() => void (globalThis.fetch = realFetch))

  test('a voice downloads once; after that it is read from the browser', async () => {
    const b = await fakeBrowser()
    await fetchVoice(voice)
    await fetchVoice(voice)
    expect(b.fetched.filter((u) => u.endsWith('.onnx'))).toHaveLength(1)
    expect(await storedVoices()).toEqual({ voices: 1, bytes: PIPER_VOICES[voice].bytes })
  })

  test('a download that ends short is refused and never kept', async () => {
    const b = await fakeBrowser()
    b.serveWith((url) => new Response(url.endsWith('.json') ? '{}' : new Uint8Array(1000)))
    await expect(fetchVoice(voice)).rejects.toThrow(/1000 of/)
    expect(await storedVoices()).toEqual({ voices: 0, bytes: 0 })
  })

  test('a voice the page no longer uses is removed', async () => {
    const b = await fakeBrowser()
    const old = 'https://huggingface.co/rhasspy/piper-voices/resolve/0000/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx'
    ;(await caches.open('md-translator-voices')).put(old, new Response('x'))
    await fetchVoice(voice)
    expect([...b.stores.get('md-translator-voices')!.keys()].some((u) => u.includes('pratham'))).toBe(false)
  })

  test('removing the voices frees all of it, and the next Play downloads again', async () => {
    const b = await fakeBrowser()
    await fetchVoice(voice)
    await removeVoices()
    expect(await storedVoices()).toEqual({ voices: 0, bytes: 0 })
    await fetchVoice(voice)
    expect(b.fetched.filter((u) => u.endsWith('.onnx'))).toHaveLength(2)
  })
})
