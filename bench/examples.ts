// Checks the worked examples Claude wrote for every language but Hindi and
// Kannada (now in src/languages.ts) against Google Translate, both
// ways: its own translation of each English line, and Claude's line translated
// back into English. Every line passed on 2026-10-04: meaning, numbers, code and
// link targets intact. The text that ships is Claude's, never Google's.
//
//   bun bench/examples.ts [staged]   prints the two checks for every line
import { LANGUAGES, type Pair } from '../src/languages'
import { gt, translateAll } from './gt'

export const WRITTEN_BY_CLAUDE = ['as', 'bn', 'gu', 'mai', 'ml', 'mr', 'ne', 'or', 'pa', 'ta', 'te', 'ur']

const EN = LANGUAGES.hi.examples.map(([en]) => en)
const zip = (to: string[]): Pair[] => EN.map((en, i) => [en, to[i]])

/** Examples for languages that already pass without them, held here until an A/B
 *  on bench/starts.ts (`staged` arm) shows they help. */
export const STAGED: Record<string, Pair[]> = {}
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
