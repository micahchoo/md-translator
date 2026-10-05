// A translation's pronunciation, in IPA, from espeak-ng compiled to WASM. The
// WASM is 18 MB (9 MB as served), so it is imported only when a reader asks to
// see a pronunciation, never when the page loads.
//
// espeak-ng reads every character it is given: `**` and `#1` would come back as
// IPA. It is handed only the words a reader sees.
//
// Every text needs a new instance, because the module is espeak-ng's command
// line and runs once. Left to itself, each instance fetches and compiles the
// WASM again: 100 blocks read 1.8 GB. So it is compiled here, once.
const WASM = new URL('../node_modules/espeak-ng/dist/espeak-ng.wasm', import.meta.url)

let engine: Promise<[typeof import('espeak-ng').default, WebAssembly.Module]> | undefined
const load = () =>
  (engine ??= Promise.all([
    import('espeak-ng').then((m) => m.default),
    fetch(WASM).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)),
  ]))

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

/** IPA for a unit's masked text, read by an espeak-ng voice; empty when it holds no words. */
export async function phonemize(voice: string, masked: string): Promise<string> {
  const text = speakable(masked)
  if (!/\p{L}/u.test(text)) return ''
  const [espeakNg, wasm] = await load()
  const espeak = await espeakNg({
    arguments: ['--phonout', 'out', '-q', '--ipa', '-v', voice, text],
    print() {},
    printErr() {},
    instantiateWasm(imports, receive) {
      WebAssembly.instantiate(wasm, imports).then(receive)
      return {}
    },
  })
  return espeak.FS.readFile('out', { encoding: 'utf8' })
    .replace(/\([a-z-]+\)/g, '') // "(en)…(hi)": where espeak switched voice for Latin letters
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Pronouncer {
  /** The IPA if it is ready; otherwise undefined, and `onReady` fires when it is. */
  get(voice: string, masked: string): string | undefined
}

/** Remembers each pronunciation and asks for one at a time, so a long document
 *  never holds more than one 18 MB instance. */
export function createPronouncer(read: typeof phonemize, onReady: () => void): Pronouncer {
  const known = new Map<string, string>()
  const asked = new Set<string>()
  let queue = Promise.resolve()
  return {
    get(voice, masked) {
      const key = `${voice}\u0000${masked}`
      if (known.has(key) || asked.has(key)) return known.get(key)
      asked.add(key)
      queue = queue.then(async () => {
        try {
          known.set(key, await read(voice, masked))
        } catch (e) {
          console.warn('Pronunciation failed:', e)
          known.set(key, '')
        }
        onReady()
      })
      return undefined
    },
  }
}
