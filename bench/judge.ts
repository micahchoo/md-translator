// Can sarvam-30b catch the two errors the rules cannot? It scores an answer
// under the app's real prompt, and under the same prompt with one thing
// swapped; the answer should be likelier under the truth.
//
//   language   the label: Hindi vs Marathi and Nepali, Assamese vs Bengali,
//              Urdu vs Kashmiri. Answers are IN22's human translations, so
//              which language each is in is known.
//   negation   the English source with and without its "not". Answers are the
//              Google Translate pairs that kept the difference (contrast-gt.ts).
//
//   bun bench/judge.ts [rows = 8] [pairs = 6]   per language; appends to corpus/runs/judge.jsonl
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { LANGUAGES, type Language } from '../src/languages'
import { buildPrompt, DEFAULT_PREAMBLE } from '../src/prompt'
import { CANDIDATES } from './candidates'
import { dropNegation, NEGATION } from './contrast'
import { gt } from './gt'
import { in22Rows, spread } from './in22'
import { score } from './likelihood'

const n = Number(process.argv[2] ?? 8)
const pairs = Number(process.argv[3] ?? 6)
const OUT = 'corpus/runs/judge.jsonl'
mkdirSync('corpus/runs', { recursive: true })
// Resumable: a (test, language) already in the file is skipped, so a crash
// costs one language. Delete the file to measure again from nothing.
const finished = new Set(
  existsSync(OUT) ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
    const r = JSON.parse(l) as { test: string; target: string }
    return `${r.test}:${r.target}`
  }) : [],
)

// The language test shows no examples: relabelled, Hindi's examples would sit
// under "Marathi:" and teach the model that Marathi lines hold Hindi (measured:
// 9 of 15 correct Hindi answers flagged with them, against 1 of 15 for Marathi).
const prompt = (lang: Language, label: string, source: string, examples = lang.examples) =>
  buildPrompt({ language: { ...lang, name: label }, preamble: DEFAULT_PREAMBLE, examples, context: [], source })

const rows = await in22Rows()
const columnOf = (l: Language) => Object.keys(CANDIDATES).find((c) => CANDIDATES[c] === l)!

// Each language with the languages that share its script, by IN22 column.
const RIVALS: Record<string, string[]> = {
  hi: ['mar_Deva', 'npi_Deva'], mr: ['hin_Deva', 'npi_Deva'], ne: ['hin_Deva', 'mar_Deva'],
  as: ['ben_Beng'], bn: ['asm_Beng'], ur: ['kas_Arab'],
}

let done = 0
const tick = () => process.stderr.write(`\r${++done} scored`)

for (const [code, rivals] of Object.entries(RIVALS)) {
  const lang = LANGUAGES[code]
  if (finished.has(`language:${lang.name}`)) continue
  const labels = [lang.name, ...rivals.map((c) => CANDIDATES[c].name)]
  const lines: string[] = []
  for (const r of spread(rows, n)) {
    // The right answer, then each rival's: every one scored under every label.
    for (const [truth, text] of [[lang.name, r[columnOf(lang)]], ...rivals.map((c) => [CANDIDATES[c].name, r[c]])]) {
      const scores: Record<string, number> = {}
      try {
        for (const label of labels) (scores[label] = (await score(prompt(lang, label, r.eng_Latn, []), ` ${text}`)).sum), tick()
      } catch (e) {
        // A step the server will not answer (a special token its output check
        // rejects): skipped and counted, never scored on a guess.
        lines.push(JSON.stringify({ test: 'language', target: lang.name, truth, skipped: String(e).slice(0, 200) }))
        continue
      }
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
      lines.push(JSON.stringify({ test: 'language', target: lang.name, truth, best, scores }))
    }
  }
  appendFileSync(OUT, lines.map((l) => l + '\n').join('')) // whole languages only, so a crash leaves none half-done
}

for (const lang of Object.values(LANGUAGES).filter((l) => l.code !== 'en')) {
  const to = lang.code
  if (finished.has(`negation:${lang.name}`)) continue
  const lines: string[] = []
  for (const r of spread(rows.filter((x) => dropNegation(x.eng_Latn) !== null), 20).slice(0, pairs)) {
    const src = r.eng_Latn
    const changed = dropNegation(src)!
    let good: string, bad: string
    try {
      ;[good, bad] = [gt('en', to, src), gt('en', to, changed)]
      // The same filter as contrast-gt.ts: the difference must survive back-translation.
      if (!NEGATION.test(gt(to, 'en', good)) || NEGATION.test(gt(to, 'en', bad))) continue
    } catch {
      continue // not in the cache
    }
    for (const [truth, text] of [['with not', good], ['without not', bad]]) {
      let withNot: number, without: number
      try {
        withNot = (await score(prompt(lang, lang.name, src), ` ${text}`)).sum
        tick()
        without = (await score(prompt(lang, lang.name, changed), ` ${text}`)).sum
        tick()
      } catch (e) {
        lines.push(JSON.stringify({ test: 'negation', target: lang.name, truth, skipped: String(e).slice(0, 200) }))
        continue
      }
      lines.push(JSON.stringify({ test: 'negation', target: lang.name, truth, best: withNot >= without ? 'with not' : 'without not', withNot, without }))
    }
  }
  appendFileSync(OUT, lines.map((l) => l + '\n').join(''))
}
process.stderr.write('\n')
