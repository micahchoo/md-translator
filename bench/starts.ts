// Short blocks at the start of a document: where a language with no examples
// goes wrong. In the browser, 2026-10-04, Urdu returned a heading unchanged and
// Telugu turned "How it works" into the word "Telugu", unflagged. The Markdown
// probe in pairs.ts is one document and missed both.
//
// Ten small documents, each fresh, through the app's own translateDocument with
// its retries. Two arms: the language's own examples (none for most), or
// Hindi's examples kept under their Hindi label. Google Translate's answer for
// each block is kept beside it, for `score-starts.py` to compare.
//
//   bun bench/starts.ts <own|hindi> [language codes...]
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { LANGUAGES } from '../src/languages'
import { createClient } from '../src/llm'
import { segment } from '../src/segment'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'
import { CANDIDATES } from './candidates'
import { gt, translateAll } from './gt'

export const DOCS = [
  '# How it works\n\nIt saves a copy every night.\n\n- Run `npm test` first\n',
  '# Getting started\n\nOpen the settings and choose a folder.\n\n- **Note**: changes are saved automatically\n',
  '## Why use it?\n\nIt keeps your notes in one place.\n\n- See the [guide](https://example.com)\n',
  '# Installation\n\nDownload the latest release.\n\n- Requires version 2.1 or newer\n',
  '## Frequently asked questions\n\nCan I use it offline?\n\n- Yes, after the first sync\n',
  '# Privacy\n\nNothing leaves your device.\n\n- No account is needed\n',
  '## Troubleshooting\n\nRestart the app if it freezes.\n\n- Clear the cache with `Ctrl+Shift+R`\n',
  '# Changelog\n\nFixed a crash on startup.\n\n- Faster search in large vaults\n',
  '## Contributing\n\nPull requests are welcome.\n\n- Please open an issue first\n',
  '# License\n\nThis project is free to use.\n\n- See the LICENSE file\n',
]

const arm = process.argv[2]
if (arm !== 'own' && arm !== 'hindi') throw new Error('usage: bun bench/starts.ts <own|hindi> [codes...]')
const codes = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(LANGUAGES).filter((c) => c !== 'en')

const units = DOCS.flatMap((d) => segment(d, { skipKeys: [] }).map((u) => u.text))
await translateAll(codes.flatMap((to) => units.map((text) => ({ from: 'en', to, text }))), 20_000)

const OUT = `corpus/runs/starts-${arm}.jsonl`
mkdirSync('corpus/runs', { recursive: true })
writeFileSync(OUT, '')
const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
for (const code of codes) {
  const language = LANGUAGES[code] ?? Object.values(CANDIDATES).find((l) => l.code === code)!
  const borrow = arm === 'hindi' && !language.examples.length
  const opts = {
    ...toOptions(DEFAULTS),
    language,
    examples: borrow ? LANGUAGES.hi.examples : language.examples,
    exampleLabel: borrow ? 'Hindi' : undefined,
  }
  for (const doc of DOCS) {
    const done = await translateDocument(doc, opts, complete, () => {})
    for (const u of done.units)
      appendFileSync(OUT, JSON.stringify({ code, source: u.unit.text, output: u.output, flags: u.flags, gt: gt('en', code, u.unit.text) }) + '\n')
  }
  process.stderr.write(`${code} `)
}
process.stderr.write('\n')
