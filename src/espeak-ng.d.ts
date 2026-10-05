// The package ships no types. Its default export is espeak-ng's command line:
// each call is a new instance that runs `arguments` once and keeps its files.
declare module 'espeak-ng' {
  export default function ESpeakNg(module: {
    arguments: string[]
    print?: () => void
    printErr?: () => void
    /** Emscripten's hook: instantiate the WASM yourself and hand the instance back. */
    instantiateWasm?: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) => object
  }): Promise<{
    FS: { readFile(path: string): Uint8Array<ArrayBuffer> }
  }>
}
