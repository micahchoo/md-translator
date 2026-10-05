import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so the build works under any GitHub Pages path.
  base: './',
  // The dev server looks only at the page. By default it parses every .html
  // under the project, and corpus/ holds 12,000 bench pages (21 GB): on
  // 2026-10-04 `bun run dev` ran out of memory doing it.
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/corpus/**'] } },
})
