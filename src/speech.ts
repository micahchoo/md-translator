// A translation read aloud. espeak-ng's rules for the language turn the text
// into IPA, and a Piper voice speaks that IPA; where a language has no Piper
// voice, or Piper fails, espeak-ng speaks it itself. Both run in the page, and
// nothing they make leaves it.
//
// Everything here is large, so it loads on the first Play, never with the page:
// espeak-ng's WASM is 18 MB (9 MB served), ONNX Runtime's 14 MB (3.7 MB), and a
// voice about 64 MB, downloaded once per language into Cache Storage.
//
// espeak-ng reads every character it is given: `**` and `#1` would be spoken.
// It is handed only the words a reader sees.
import type { Voice } from './languages'

// Every text needs a new espeak-ng instance, because the module is espeak-ng's
// command line and runs once. Left to itself, each instance fetches and
// compiles the WASM again: 100 blocks read 1.8 GB. So it is compiled here, once.
const WASM = new URL('../node_modules/espeak-ng/dist/espeak-ng.wasm', import.meta.url)

let engine: Promise<[typeof import('espeak-ng').default, WebAssembly.Module]> | undefined
const load = () =>
  (engine ??= Promise.all([
    import('espeak-ng').then((m) => m.default),
    fetch(WASM).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)),
  ]))

/** Runs espeak-ng's command line once and returns the file it wrote. */
async function espeak(args: string[], file: string): Promise<Uint8Array<ArrayBuffer>> {
  const [espeakNg, wasm] = await load()
  const run = await espeakNg({
    arguments: args,
    print() {},
    printErr() {},
    instantiateWasm(imports, receive) {
      WebAssembly.instantiate(wasm, imports).then(receive)
      return {}
    },
  })
  return run.FS.readFile(file)
}

/** The words of a masked unit, as a reader sees them: no code, marks or link targets. */
function speakable(masked: string): string {
  return masked
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[\[#\d+\|([^\]]*)\]\]/g, '$1')
    .replace(/!?\[\[#\d+\]\]/g, ' ')
    .replace(/!?\[([^\]]*)\]\(#\d+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_~=]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Each script's clause marks, as the ASCII mark a Piper voice was trained to pause on. */
const PAUSE: Record<string, string> = {
  ',': ',', '،': ',', ';': ';', '؛': ';', ':': ':',
  '.': '.', '।': '.', '॥': '.', '۔': '.', '?': '?', '؟': '?', '!': '!',
}
const CLAUSE = /([,،;؛:.।॥۔?؟!])\s*/

/**
 * The IPA espeak-ng's rules give a unit's words, clause by clause, with the
 * punctuation between clauses kept: espeak-ng drops it, and a Piper voice
 * pauses only where it sees it. Every clause ends in a mark.
 */
export async function phonemes(rules: string, masked: string): Promise<string> {
  const parts = speakable(masked).split(CLAUSE)
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const words = parts[i].trim()
    if (!/\p{L}/u.test(words)) continue
    const ipa = new TextDecoder()
      .decode(await espeak(['--phonout', 'out', '-q', '--ipa', '-v', rules, words], 'out'))
      .replace(/\([a-z-]+\)/g, '') // "(en)…(hi)": where espeak switched voice for Latin letters
      .replace(/\s+/g, ' ')
      .trim()
    if (ipa) out.push(ipa + (PAUSE[parts[i + 1] ?? ''] ?? '.'))
  }
  return out.join(' ')
}

/**
 * A Piper voice's input: each symbol's id, padded, between a start and an end.
 * Symbols are split into letter and marks first (NFD), as the voices were
 * trained; one a voice does not know is left out.
 */
export function idsOf(ipa: string, map: Record<string, number[]>): number[] {
  const ids = [...map['^'], ...map['_']]
  for (const ch of ipa.normalize('NFD')) if (map[ch]) ids.push(...map[ch], ...map['_'])
  ids.push(...map['$'])
  return ids
}

/** Samples in -1…1 as a 16-bit mono WAV file. */
export function wavOf(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const wav = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(wav.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true))
  return wav
}

/**
 * The Piper voices the page uses, from rhasspy/piper-voices at one commit, so
 * a file can never change under us. They load from Hugging Face, not from this
 * site: hosting them here would spend half of GitHub Pages' 1 GB on eight
 * voices, and redistribute voices whose terms bind whoever redistributes them.
 * Credits are in the README. `bytes` is the model's size, for the download's
 * progress: a server that compresses a file drops its Content-Length.
 */
export const PIPER_COMMIT = 'c10ece1aade47bb51c153c893d14e5bf8e5b7117'
export const PIPER_VOICES: Record<string, { path: string; bytes: number }> = {
  'bn_BD-google-medium': { path: 'bn/bn_BD/google/medium/bn_BD-google-medium', bytes: 76782515 },
  'en_US-ljspeech-medium': { path: 'en/en_US/ljspeech/medium/en_US-ljspeech-medium', bytes: 63531379 },
  'hi_IN-rohan-medium': { path: 'hi/hi_IN/rohan/medium/hi_IN-rohan-medium', bytes: 62950044 },
  'ml_IN-arjun-medium': { path: 'ml/ml_IN/arjun/medium/ml_IN-arjun-medium', bytes: 62950044 },
  'mr_IN-google-medium': { path: 'mr/mr_IN/google/medium/mr_IN-google-medium', bytes: 76768179 },
  'ne_NP-chitwan-medium': { path: 'ne/ne_NP/chitwan/medium/ne_NP-chitwan-medium', bytes: 62950044 },
  'te_IN-padmavathi-medium': { path: 'te/te_IN/padmavathi/medium/te_IN-padmavathi-medium', bytes: 63516050 },
  'ur_PK-fasih-medium': { path: 'ur/ur_PK/fasih/medium/ur_PK-fasih-medium', bytes: 63532015 },
}

interface PiperConfig {
  audio: { sample_rate: number }
  inference: { noise_scale: number; length_scale: number; noise_w: number }
  num_speakers: number
  phoneme_id_map: Record<string, number[]>
}

export type Progress = (loaded: number, total: number) => void

const CACHE = 'md-translator-voices'
const urlOf = (name: string) => `https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_COMMIT}/${PIPER_VOICES[name].path}`
const CURRENT = new Set(Object.keys(PIPER_VOICES).flatMap((n) => [`${urlOf(n)}.onnx`, `${urlOf(n)}.onnx.json`]))

// The cache, with every voice the page no longer uses removed the first time it
// opens. A voice is kept under its URL, which holds the commit: when the commit
// moves or a language changes voice, nothing asks for the old file again, and
// it would hold 64 MB of the reader's disk forever.
let opened: Promise<Cache> | undefined
const voiceCache = () =>
  (opened ??= caches.open(CACHE).then(async (cache) => {
    for (const r of await cache.keys()) if (!CURRENT.has(r.url)) await cache.delete(r)
    return cache
  }))

/** A voice file, kept in Cache Storage after the first time: a reload or a restart reads it from there. */
async function voiceFile(url: string, progress?: { total: number; report: Progress }): Promise<Response> {
  const cache = await voiceCache()
  const kept = await cache.match(url)
  if (kept) return kept
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`)
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (const reader = res.body.getReader(); ; ) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    progress?.report(Math.min(loaded, progress.total), progress.total)
  }
  // A server may end a response early without an error. Kept, a short model
  // would fail on every Play after; refused, the next Play downloads it again.
  if (progress && loaded !== progress.total) throw new Error(`${url}: ${loaded} of ${progress.total} bytes arrived`)
  const body = new Blob(chunks as BlobPart[])
  await cache.put(url, new Response(body, { headers: { 'content-type': res.headers.get('content-type') ?? '' } }))
  return new Response(body)
}

/** A Piper voice's config and model, downloaded the first time and read from the browser after. */
export async function fetchVoice(name: string, onProgress?: Progress): Promise<{ config: PiperConfig; model: ArrayBuffer }> {
  const url = urlOf(name)
  const config: PiperConfig = await (await voiceFile(`${url}.onnx.json`)).json()
  const report: Progress = onProgress ?? (() => {})
  const model = await (await voiceFile(`${url}.onnx`, { total: PIPER_VOICES[name].bytes, report })).arrayBuffer()
  return { config, model }
}

/** How many voices this browser keeps, and the space they take. */
export async function storedVoices(): Promise<{ voices: number; bytes: number }> {
  const names = (await (await voiceCache()).keys()).map((r) => r.url).filter((u) => u.endsWith('.onnx')).map((u) => Object.keys(PIPER_VOICES).find((n) => u === `${urlOf(n)}.onnx`)!)
  return { voices: names.length, bytes: names.reduce((sum, n) => sum + PIPER_VOICES[n].bytes, 0) }
}

/** Removes every voice from this browser. The next Play in a language downloads its voice again. */
export async function removeVoices(): Promise<void> {
  opened = undefined
  await caches.delete(CACHE)
  for (const [name, s] of sessions) {
    sessions.delete(name)
    s.then(({ session }) => session.release(), () => {})
  }
}

type Session = { config: PiperConfig; session: import('onnxruntime-web').InferenceSession }
const sessions = new Map<string, Promise<Session>>()
let runtime: Promise<typeof import('onnxruntime-web/wasm')> | undefined

function piperVoice(name: string, onProgress?: Progress): Promise<Session> {
  let s = sessions.get(name)
  if (!s) {
    s = (async () => {
      const ort = await (runtime ??= import('onnxruntime-web/wasm'))
      const { config, model } = await fetchVoice(name, onProgress)
      return { config, session: await ort.InferenceSession.create(model, { executionProviders: ['wasm'] }) }
    })()
    // A failed load is not kept: the next Play tries again.
    s.catch(() => sessions.delete(name))
    sessions.set(name, s)
  }
  return s
}

async function piper(name: string, ipa: string, onProgress?: Progress): Promise<Uint8Array<ArrayBuffer>> {
  const { config, session } = await piperVoice(name, onProgress)
  const ort = await runtime!
  const ids = idsOf(ipa, config.phoneme_id_map)
  const { noise_scale, length_scale, noise_w } = config.inference
  const feeds: Record<string, import('onnxruntime-web').Tensor> = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([noise_scale, length_scale, noise_w]), [3]),
  }
  // A voice of several speakers (Bengali's and Marathi's) speaks as its first.
  if (config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
  const out = await session.run(feeds)
  return wavOf(out[session.outputNames[0]].data as Float32Array, config.audio.sample_rate)
}

/** A WAV file of a unit's masked text; null when it holds no words. */
export async function speak(voice: Voice, masked: string, onProgress?: Progress): Promise<Uint8Array<ArrayBuffer> | null> {
  const text = speakable(masked)
  if (!/\p{L}/u.test(text)) return null
  if (voice.piper && typeof document !== 'undefined') {
    try {
      const ipa = await phonemes(voice.espeak, masked)
      if (ipa) return await piper(voice.piper, ipa, onProgress)
    } catch (e) {
      console.warn(`The ${voice.piper} voice failed; espeak-ng reads this instead.`, e)
    }
  }
  // A 30 ms gap between words: heard against the default, Klatt and four
  // variants on 2026-10-04, it and Klatt sounded least mechanical, and this
  // build has no Klatt.
  return espeak(['-w', 'out.wav', '-g', '3', '-v', voice.espeak, text], 'out.wav')
}
