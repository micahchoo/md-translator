// sarvam-30b against PIB's own translations, English into each language, on
// sentence pairs from pib-parallel's align.py (github.com/micahchoo/pib-parallel). Only the safest pairs: LaBSE
// similarity at least 0.85, the same numbers on both sides where any appear,
// 40 to 300 characters of English, normal confidence, at most 5 from one
// release, so a weak aligner costs pairs and not accuracy.
//
// Google Translate runs on the same English. That is the second half of the
// test: PIB loads a machine-translation plugin, and if Google agrees with PIB's
// text far more than with IN22's human translations, PIB's text is machine
// output too, and chrF against it rewards whatever writes like a machine.
//
// sarvam-30b was published on 2026-03-03. Releases older than that may be in
// its training data; the score script says how many are.
//
//   bun bench/pib-bench.ts <sentences.jsonl> [n = 200] [codes...]
//
// Writes $PIB_DIR/<code>.jsonl (default corpus/runs/pib-bench); a language already there is
// skipped, so a crash costs one language. GT_BUDGET caps the new characters
// sent to Google (default 450,000, about $9). Score with bench/score-pib.py.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { LANGUAGES } from '../src/languages'
import { createClient } from '../src/llm'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument, type UnitResult } from '../src/translate'
import { gt, translateAll } from './gt'

type Pair = { lang: string; en: string; text: string; sim: number; numbers: boolean | null; confidence: string; prid: string; date: string; office: string }

const MIN_SIM = 0.85
const PER_RELEASE = 5
// Google writes Manipuri in Meetei Mayek; PIB writes it in Bengali script.
const NO_GT = new Set(['mni'])

const [file, nArg, ...codeArgs] = process.argv.slice(2)
if (!file) throw new Error('usage: bun bench/pib-bench.ts <sentences.jsonl> [n] [codes...]')
const n = Number(nArg ?? 200)
const dir = process.env.PIB_DIR ?? 'corpus/runs/pib-bench'
const budget = Number(process.env.GT_BUDGET ?? 450_000)

const pairs: Pair[] = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const safe = pairs.filter(
  (p) => p.sim >= MIN_SIM && p.numbers !== false && p.confidence === 'normal' && p.en.length >= 40 && p.en.length <= 300,
)

/** Up to n pairs, taken a round at a time across releases so no release dominates. */
function pick(lang: string): Pair[] {
  const byRelease = new Map<string, Pair[]>()
  const seen = new Set<string>()
  for (const p of safe) {
    if (p.lang !== lang || seen.has(p.en)) continue
    seen.add(p.en)
    byRelease.set(p.prid, [...(byRelease.get(p.prid) ?? []), p])
  }
  const out: Pair[] = []
  for (let round = 0; round < PER_RELEASE && out.length < n; round++)
    for (const list of byRelease.values()) if (list[round] && out.length < n) out.push(list[round])
  return out
}

const codes = codeArgs.length ? codeArgs : [...new Set(safe.map((p) => p.lang))].filter((c) => c in LANGUAGES && c !== 'en')
const chosen = Object.fromEntries(codes.map((c) => [c, pick(c)]))
await translateAll(
  codes.filter((c) => !NO_GT.has(c) && !existsSync(`${dir}/${c}.jsonl`)).flatMap((to) => chosen[to].map((p) => ({ from: 'en', to, text: p.en }))),
  budget,
)

const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })

/** A dropped connection is retried: on 2026-10-04 one reset from the server's proxy ended a run and lost its language. */
async function translate(md: string, opts: ReturnType<typeof toOptions>): Promise<UnitResult[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await translateDocument(md, opts, complete, () => {})).units
    } catch (e) {
      if (attempt >= 3) throw e
      console.error(`  ${(e as Error).message}; retrying in ${10 * attempt} s`)
      await Bun.sleep(10_000 * attempt)
    }
  }
}

/** Each sentence a block of one document, twenty at a time; a chunk whose blocks do not come back one for one goes sentence by sentence. */
async function sarvam(code: string, sources: string[]): Promise<UnitResult[]> {
  const opts = toOptions({ ...DEFAULTS, language: code })
  const out: UnitResult[] = []
  for (let i = 0; i < sources.length; i += 20) {
    const chunk = sources.slice(i, i + 20)
    const units = await translate(chunk.join('\n\n') + '\n', opts)
    if (units.length === chunk.length) out.push(...units)
    else for (const s of chunk) out.push((await translate(`${s}\n`, opts))[0])
    console.error(`  ${code} ${out.length}/${sources.length}`)
  }
  return out
}

mkdirSync(dir, { recursive: true })
for (const code of codes) {
  const out = `${dir}/${code}.jsonl`
  if (existsSync(out)) continue
  const rows = chosen[code]
  if (!rows.length) continue
  const started = Date.now()
  const units = await sarvam(code, rows.map((p) => p.en))
  writeFileSync(
    out,
    rows
      .map((p, i) =>
        JSON.stringify({
          dir: 'from-en', source: p.en, reference: p.text, output: units[i]?.output ?? '', flags: units[i]?.flags ?? [],
          gt: NO_GT.has(code) ? null : gt('en', code, p.en), sim: p.sim, prid: p.prid, date: p.date, office: p.office,
        }),
      )
      .join('\n') + '\n',
  )
  console.log(`${code} ${LANGUAGES[code].name}: ${rows.length} pairs, ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
