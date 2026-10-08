import { defineConfig, type Plugin } from 'vite'

// The built page may run only its own scripts. A hosted model's key sits in
// this page's storage (src/key.ts), and no script from elsewhere should run
// beside it. connect-src stays open: the model endpoint is the reader's choice.
// The dev server is left without it, since Vite's hot reload runs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  'connect-src * data: blob:',
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  'media-src blob:',
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  // Relative asset paths, so the build works under any GitHub Pages path.
  base: './',
  plugins: [csp()],
  // Workers are ES modules: the ONNX worker (src/onnx.worker.ts) imports ONNX Runtime.
  worker: { format: 'es' },
  // The dev server looks only at the page. By default it parses every .html
  // under the project, and corpus/ holds 12,000 bench pages (21 GB): on
  // 2026-10-04 `bun run dev` ran out of memory doing it.
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/corpus/**'] } },
})
