// Screens languages for the list: each one both ways through the real
// pipeline on the same IN22-Gen rows, plus a Markdown probe from English.
//
//   bun bench/pairs.ts 10                  every candidate, 10 rows each way
//   bun bench/pairs.ts 10 mar_Deva tam_Taml
//
// The rows go to $PAIRS_DIR/<column>.jsonl (default corpus/runs/pairs); a
// language already there is skipped, so a crash costs one language. $PREAMBLE
// replaces the default preamble, for comparing two. Score with bench/score.py.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { LANGUAGES, type Language } from '../src/languages'
import { createClient } from '../src/llm'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument, type UnitResult } from '../src/translate'
import { CANDIDATES } from './candidates'
import { fromIN22 } from './examples'
import { in22Rows, spread } from './in22'

const n = Number(process.argv[2] ?? 10)
const columns = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(CANDIDATES)
const dir = process.env.PAIRS_DIR ?? 'corpus/runs/pairs'
const preamble = process.env.PREAMBLE ?? DEFAULTS.preamble

// Not the shipped examples, so Hindi and Kannada get no head start. The second
// heading is a question the model must not answer.
const PROBE = `# Getting started

## What does the export include?

- **Drafts**: every unsaved note, kept for 30 days

Open \`settings.json\` and change the [default folder](https://example.com/folders). Restart the app afterwards.

The EU's 2025 rules apply to **all new devices** from March 2026. [Details](https://example.com/eu)
`

const all = await in22Rows()
const sample = spread(all, n)

const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })

// A language with no examples of its own borrows IN22's human rows (examples.ts#fromIN22).
const withExamples = (col: string, l: Language): Language => (l.examples.length || l.code === 'en' ? l : { ...l, examples: fromIN22(all, col) })

async function run(md: string, language: Language): Promise<UnitResult[]> {
  const opts = { ...toOptions({ ...DEFAULTS, preamble, language: 'en' }), language, examples: language.examples }
  return (await translateDocument(md, opts, complete, () => {})).units
}

mkdirSync(dir, { recursive: true })
for (const col of columns) {
  const target = withExamples(col, CANDIDATES[col])
  const out = `${dir}/${col}.jsonl`
  if (existsSync(out)) continue
  const started = Date.now()
  const into = await run(sample.map((r) => r[col]).join('\n\n'), LANGUAGES.en)
  const from = await run(sample.map((r) => r.eng_Latn).join('\n\n'), target)
  const probe = await run(PROBE, target)
  if (into.length !== n || from.length !== n) throw new Error(`${col}: ${into.length}/${from.length} units for ${n} rows`)
  writeFileSync(
    out,
    [
      ...sample.map((r, i) => ({ dir: 'into-en', source: r[col], reference: r.eng_Latn, output: into[i].output, flags: into[i].flags })),
      ...sample.map((r, i) => ({ dir: 'from-en', source: r.eng_Latn, reference: r[col], output: from[i].output, flags: from[i].flags })),
      ...probe.map((u) => ({ dir: 'probe', source: u.unit.text, output: u.output, flags: u.flags })),
    ].map((x) => JSON.stringify(x)).join('\n') + '\n',
  )
  console.log(`${col} ${target.name}: ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
