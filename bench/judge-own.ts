// The judge on sarvam-30b's own answers. judge.ts measured it on human and
// Google Translate text; a model may find its own phrasing likelier, and so
// excuse its own errors. Here every answer judged is the model's.
//
//   negation   the model translates each English sentence with its "not" and
//              without it. Google Translate turns each answer back into English
//              to say whether the "not" really survived; that, not what was
//              asked for, is the truth. So the test also asks whether the judge
//              catches a "not" the model dropped by itself.
//   language   the model writes the same sentence in each language of a script
//              group; each answer is scored under every label of the group.
//
//   bun bench/judge-own.ts [rows = 15]        resumable; writes corpus/runs/judge-own*.jsonl
//   bun bench/judge-own.ts score              reads them back
//
// A label read off a back-translation misses a negation carried by a word
// ("inadmissible", "without", "as good as"), so `score` trusts only answers
// whose back-translation agrees with what was asked, and lists the rest to be
// read by hand. Of the first four disagreements read (Assamese), none was a
// dropped "not".
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { LANGUAGES, type Language } from '../src/languages'
import { createClient } from '../src/llm'
import { buildPrompt, DEFAULT_PREAMBLE } from '../src/prompt'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'
import { CANDIDATES } from './candidates'
import { dropNegation, NEGATION } from './contrast'
import { gt, translateAll } from './gt'
import { in22Rows, spread } from './in22'
import { score } from './likelihood'

const scoring = process.argv[2] === 'score'
const n = scoring ? 15 : Number(process.argv[2] ?? 15)
const ANSWERS = 'corpus/runs/judge-own-answers.jsonl'
const OUT = 'corpus/runs/judge-own.jsonl'

const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
const rows = await in22Rows()
const byCode = (code: string) => LANGUAGES[code] ?? Object.values(CANDIDATES).find((l) => l.code === code)!

// --- the model's answers, kept so a rerun asks for none twice ----------------
const answers = new Map<string, string>()
if (existsSync(ANSWERS))
  for (const l of readFileSync(ANSWERS, 'utf8').trim().split('\n').filter(Boolean)) {
    const a = JSON.parse(l) as { code: string; source: string; output: string }
    answers.set(`${a.code}\u0000${a.source}`, a.output)
  }

async function translate(lang: Language, source: string): Promise<string> {
  const key = `${lang.code}\u0000${source}`
  if (!answers.has(key)) {
    const opts = { ...toOptions(DEFAULTS), language: lang, examples: lang.examples }
    const r = await translateDocument(`${source}\n`, opts, complete, () => {})
    answers.set(key, r.units[0]?.output ?? '')
    appendFileSync(ANSWERS, JSON.stringify({ code: lang.code, source, output: answers.get(key) }) + '\n')
  }
  return answers.get(key)!
}

const finished = new Set(
  existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
    const r = JSON.parse(l) as { test: string; target: string }
    return `${r.test}:${r.target}`
  }) : [],
)
const prompt = (lang: Language, label: string, source: string, examples = lang.examples) =>
  buildPrompt({ language: { ...lang, name: label }, preamble: DEFAULT_PREAMBLE, examples, context: [], source })

// --- score: read the saved results back --------------------------------------
if (scoring) {
  const negRowsForScore = spread(rows.filter((r) => dropNegation(r.eng_Latn) !== null), 20).slice(0, n)
  interface Line { test: string; target: string; asked: string; truth: string; best: string; text?: string; skipped?: string }
  const all = readFileSync(OUT, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Line)
  console.log('NEGATION — only answers whose back-translation agrees with what was asked')
  for (const lang of Object.values(LANGUAGES).filter((l) => l.code !== 'en')) {
    const lines = all.filter((l) => l.test === 'negation' && l.target === lang.name)
    if (!lines.length) continue
    // Lines written before `text` was recorded are rebuilt in their fixed order.
    const texts = negRowsForScore.flatMap((r) => [answers.get(`${lang.code}\u0000${r.eng_Latn}`), answers.get(`${lang.code}\u0000${dropNegation(r.eng_Latn)}`)]).filter(Boolean) as string[]
    if (texts.length !== lines.length) throw new Error(`${lang.name}: ${lines.length} lines for ${texts.length} answers`)
    const rowsOf = lines.map((l, i) => ({ ...l, text: l.text ?? texts[i] })).filter((l) => !l.skipped)
    const said = (t: string) => (NEGATION.test(gt(lang.code, 'en', t)) ? 'with not' : 'without not')
    const agree = rowsOf.filter((l) => said(l.text) === l.asked)
    const kept = agree.filter((l) => l.asked === 'with not')
    const lost = agree.filter((l) => l.asked === 'without not')
    const alarms = kept.filter((l) => l.best !== 'with not').length
    const caught = lost.filter((l) => l.best === 'without not').length
    const unclear = rowsOf.filter((l) => said(l.text) !== l.asked)
    console.log(`${lang.name.padEnd(10)} false alarm ${alarms}/${kept.length}   caught ${caught}/${lost.length}   to read by hand ${unclear.length}`)
  }
  const lang = all.filter((l) => l.test === 'language' && !l.skipped)
  console.log('\nLANGUAGE — the model\'s own answers')
  for (const t of [...new Set(lang.map((l) => l.target))]) {
    const xs = lang.filter((l) => l.target === t)
    const own = xs.filter((l) => l.truth === t)
    const other = xs.filter((l) => l.truth !== t)
    console.log(`${t.padEnd(10)} false alarm ${own.filter((l) => l.best !== t).length}/${own.length}   caught ${other.filter((l) => l.best !== t).length}/${other.length}`)
  }
  process.exit(0)
}

// --- negation ---------------------------------------------------------------
const negRows = spread(rows.filter((r) => dropNegation(r.eng_Latn) !== null), 20).slice(0, n)
for (const lang of Object.values(LANGUAGES).filter((l) => l.code !== 'en')) {
  if (finished.has(`negation:${lang.name}`)) continue
  const pairs: { src: string; changed: string; withNot: string; without: string }[] = []
  for (const r of negRows) {
    const src = r.eng_Latn
    const changed = dropNegation(src)!
    pairs.push({ src, changed, withNot: await translate(lang, src), without: await translate(lang, changed) })
  }
  await translateAll(pairs.flatMap((p) => [p.withNot, p.without].filter(Boolean).map((text) => ({ from: lang.code, to: 'en', text }))), 40_000)
  const lines: string[] = []
  for (const p of pairs)
    for (const [asked, text] of [['with not', p.withNot], ['without not', p.without]] as const) {
      if (!text) continue
      // The truth is what the answer says, read back in English, not what was asked for.
      const truth = NEGATION.test(gt(lang.code, 'en', text)) ? 'with not' : 'without not'
      try {
        const a = (await score(prompt(lang, lang.name, p.src), ` ${text}`)).sum
        const b = (await score(prompt(lang, lang.name, p.changed), ` ${text}`)).sum
        lines.push(JSON.stringify({ test: 'negation', target: lang.name, asked, truth, text, best: a >= b ? 'with not' : 'without not' }))
      } catch (e) {
        lines.push(JSON.stringify({ test: 'negation', target: lang.name, asked, truth, skipped: String(e).slice(0, 200) }))
      }
    }
  appendFileSync(OUT, lines.map((l) => l + '\n').join(''))
  process.stderr.write(`negation ${lang.code} `)
}

// --- language ---------------------------------------------------------------
const GROUPS: Record<string, string[]> = { hi: ['mr', 'ne'], mr: ['hi', 'ne'], ne: ['hi', 'mr'], as: ['bn'] }
for (const [code, rivals] of Object.entries(GROUPS)) {
  const lang = LANGUAGES[code]
  if (finished.has(`language:${lang.name}`)) continue
  const labels = [lang.name, ...rivals.map((c) => byCode(c).name)]
  const lines: string[] = []
  for (const r of spread(rows, n)) {
    for (const writer of [code, ...rivals]) {
      const text = await translate(byCode(writer), r.eng_Latn)
      if (!text) continue
      const scores: Record<string, number> = {}
      try {
        for (const label of labels) scores[label] = (await score(prompt(lang, label, r.eng_Latn, []), ` ${text}`)).sum
      } catch (e) {
        lines.push(JSON.stringify({ test: 'language', target: lang.name, truth: byCode(writer).name, skipped: String(e).slice(0, 200) }))
        continue
      }
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
      lines.push(JSON.stringify({ test: 'language', target: lang.name, truth: byCode(writer).name, best, scores }))
    }
  }
  appendFileSync(OUT, lines.map((l) => l + '\n').join(''))
  process.stderr.write(`language ${code} `)
}
process.stderr.write('\n')
