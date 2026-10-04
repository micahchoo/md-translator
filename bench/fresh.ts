// Into English from text the model cannot have seen. Each IN22 sentence goes
// into English twice: from its human translation, which may be in the model's
// training data, and from Google Translate's version of the same English, which
// is not. Both are scored against the same English (`score-fresh.py`). A large
// gap would mean IN22 scores are inflated by memory.
//
//   bun bench/fresh.ts [rows = 10] [codes...]
import { appendFileSync, writeFileSync } from 'node:fs'
import { LANGUAGES } from '../src/languages'
import { createClient } from '../src/llm'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'
import { CANDIDATES } from './candidates'
import { gt, translateAll } from './gt'
import { in22Rows, spread } from './in22'

const n = Number(process.argv[2] ?? 10)
const codes = process.argv.length > 3 ? process.argv.slice(3) : ['hi', 'ta', 'bn', 'te', 'mr', 'ur']
const OUT = 'corpus/runs/fresh.jsonl'
writeFileSync(OUT, '')

// The rows contrast-gt.ts already sent to Google Translate, so most are cached.
const rows = spread((await in22Rows()).filter((r) => /\d/.test(r.eng_Latn)), 20).slice(0, n)
await translateAll(codes.flatMap((to) => rows.map((r) => ({ from: 'en', to, text: r.eng_Latn }))), 20_000)

const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
const opts = toOptions({ ...DEFAULTS, language: 'en' })
const intoEnglish = async (text: string) => (await translateDocument(`${text}\n`, opts, complete, () => {})).units[0]?.output ?? ''

for (const code of codes) {
  const col = Object.keys(CANDIDATES).find((c) => CANDIDATES[c] === LANGUAGES[code])!
  for (const r of rows)
    for (const [from, source] of [['human', r[col]], ['google', gt('en', code, r.eng_Latn)]] as const)
      appendFileSync(OUT, JSON.stringify({ code, from, reference: r.eng_Latn, output: await intoEnglish(source) }) + '\n')
  process.stderr.write(`${code} `)
}
process.stderr.write('\n')
