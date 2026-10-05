// A translation read aloud, by espeak-ng compiled to WASM. The WASM is 18 MB
// (9 MB as served), so it is imported only when a reader presses Play, never
// when the page loads.
//
// espeak-ng reads every character it is given: `**` and `#1` would be spoken.
// It is handed only the words a reader sees.
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

/** A WAV file of a unit's masked text, read by an espeak-ng voice; null when it holds no words. */
export async function speak(voice: string, masked: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const text = speakable(masked)
  if (!/\p{L}/u.test(text)) return null
  const [espeakNg, wasm] = await load()
  const espeak = await espeakNg({
    arguments: ['-w', 'out.wav', '-v', voice, text],
    print() {},
    printErr() {},
    instantiateWasm(imports, receive) {
      WebAssembly.instantiate(wasm, imports).then(receive)
      return {}
    },
  })
  return espeak.FS.readFile('out.wav')
}
