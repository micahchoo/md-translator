// Look-ahead on contiguous prose, where the next sentence can settle a pronoun,
// a term or a tense. Each FLORES+ devtest article becomes one document, one
// sentence per block, translated with and without the next block shown;
// `score-contiguous.py` scores both against the professional translations.
// FLORES+ stays in the git-ignored corpus/ (its terms forbid re-hosting).
//
//   bun bench/contiguous.ts [articles = 15] [codes = hi,ta,bn,mr]
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '../src/llm'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'

const n = Number(process.argv[2] ?? 15)
const codes = (process.argv[3] ?? 'hi,ta,bn,mr').split(',')
const FLORES: Record<string, string> = { hi: 'hin_Deva', ta: 'tam_Taml', bn: 'ben_Beng', mr: 'mar_Deva', kn: 'kan_Knda' }
const OUT = 'corpus/runs/contiguous.jsonl'
writeFileSync(OUT, '')

type Line = { text: string; url: string }
const read = (c: string) => readFileSync(`corpus/flores_plus/devtest/${c}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Line)
const english = read('eng_Latn')
// Articles of three sentences or more, in their order.
const articles: number[][] = []
english.forEach((s, i) => (i && english[i - 1].url === s.url ? articles[articles.length - 1].push(i) : articles.push([i])))
const chosen = articles.filter((a) => a.length >= 3).slice(0, n)

const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
for (const code of codes) {
  const refs = read(FLORES[code])
  for (const ahead of [false, true])
    for (const a of chosen) {
      const md = a.map((i) => english[i].text).join('\n\n') + '\n'
      const r = await translateDocument(md, { ...toOptions({ ...DEFAULTS, language: code }), lookAhead: ahead }, complete, () => {})
      if (r.units.length !== a.length) continue // a sentence Markdown split or merged: not comparable
      r.units.forEach((u, k) => appendFileSync(OUT, JSON.stringify({ code, ahead, output: u.output, flags: u.flags, reference: refs[a[k]].text }) + '\n'))
    }
  process.stderr.write(`${code} `)
}
process.stderr.write('\n')
