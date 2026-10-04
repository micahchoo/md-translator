// The owner's own Markdown, which no model has seen, through the app's code.
// There is no reference translation, so it measures only what needs none: how
// often a block is flagged, and of which kind. `score-realdocs.py` adds GlotLID
// per block. The documents are named on the command line and never copied into
// the repository; outputs go to the git-ignored corpus/.
//
//   bun bench/realdocs.ts <blocks per document> <codes,comma,separated> <file.md>...
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { LANGUAGES } from '../src/languages'
import { createClient } from '../src/llm'
import { segment } from '../src/segment'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'

const [max, codes, ...files] = process.argv.slice(2)
if (!files.length) throw new Error('usage: bun bench/realdocs.ts <blocks> <codes> <file.md>...')
const OUT = 'corpus/runs/realdocs.jsonl'
writeFileSync(OUT, '')
const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })

for (const file of files) {
  const full = readFileSync(file, 'utf8')
  // Cut after the last whole block that fits, so the Markdown stays whole.
  const units = segment(full, { skipKeys: DEFAULTS.skipKeys.split(',').map((k) => k.trim()) })
  const end = units[Math.min(Number(max), units.length) - 1].end
  const md = full.slice(0, full.indexOf('\n', end) + 1 || full.length)
  for (const code of codes.split(',')) {
    const started = Date.now()
    const r = await translateDocument(md, toOptions({ ...DEFAULTS, language: code }), complete, () => {})
    for (const u of r.units) appendFileSync(OUT, JSON.stringify({ doc: basename(file), code, source: u.unit.text, output: u.output, flags: u.flags }) + '\n')
    process.stderr.write(`${basename(file)} ${code} ${r.units.length} blocks ${Math.round((Date.now() - started) / 1000)} s\n`)
  }
}
