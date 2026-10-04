// Checks the worked examples Claude wrote for every language but Hindi and
// Kannada (now in src/languages.ts) against Google Translate, both
// ways: its own translation of each English line, and Claude's line translated
// back into English. Every line passed on 2026-10-04: meaning, numbers, code and
// link targets intact. The text that ships is Claude's, never Google's.
//
//   bun bench/examples.ts [staged]   prints the two checks for every line
import { LANGUAGES, type Pair } from '../src/languages'
import type { Row } from './in22'
import { gt, translateAll } from './gt'

export const WRITTEN_BY_CLAUDE = ['as', 'bn', 'doi', 'gom', 'gu', 'mai', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'ta', 'te', 'ur']

const EN = LANGUAGES.hi.examples.map(([en]) => en)
const zip = (to: string[]): Pair[] => EN.map((en, i) => [en, to[i]])

/** Examples for languages that already pass without them, held here until an A/B
 *  on bench/starts.ts (`staged` arm) shows they help. */
export const STAGED: Record<string, Pair[]> = {}
/**
 * Examples from IN22's own human translations, for languages Claude cannot
 * write: the same five rows in every language, chosen so that no test sample
 * of any size (bench/in22.ts#spread, 1 to 40 rows) contains them. The Markdown
 * wraps whole sentences only, so it fits any word order. Built by the bench
 * scripts that already read IN22; nothing the app or its tests load uses it.
 */
export const IN22_EXAMPLE_ROWS = { short: 268, question: 277, bold: 76, link: 45, numbers: 221 }

export function fromIN22(rows: Row[], column: string): Pair[] {
  const at = (i: number): [string, string] => [rows[i].eng_Latn, rows[i][column]]
  const r = IN22_EXAMPLE_ROWS
  const [b, bt] = at(r.bold)
  const [l, lt] = at(r.link)
  return [at(r.short), at(r.question), [`**${b}**`, `**${bt}**`], [`[${l}](#1) \`npm install\``, `[${lt}](#1) \`npm install\``], at(r.numbers)]
}

const examplesOf = (code: string) => STAGED[code] ?? LANGUAGES[code].examples

if (import.meta.main) {
  const codes = process.argv[2] === 'staged' ? Object.keys(STAGED) : WRITTEN_BY_CLAUDE
  const jobs = codes.flatMap((code) =>
    examplesOf(code).flatMap(([en, t]) => [{ from: 'en', to: code, text: en }, { from: code, to: 'en', text: t }]),
  )
  await translateAll(jobs, 20_000)
  for (const code of codes) {
    console.log(`== ${code}`)
    for (const [en, t] of examplesOf(code)) console.log(`  mine: ${t}\n  GT:   ${gt('en', code, en)}\n  back: ${gt(code, 'en', t)}\n`)
  }
}
