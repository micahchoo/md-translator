// Checks the worked examples Claude wrote for Urdu, Bengali, Odia, Gujarati,
// Maithili and Punjabi (now in src/languages.ts) against Google Translate, both
// ways: its own translation of each English line, and Claude's line translated
// back into English. Every line passed on 2026-10-04: meaning, numbers, code and
// link targets intact. The text that ships is Claude's, never Google's.
//
//   bun bench/examples.ts            prints the two checks for every line
import { LANGUAGES } from '../src/languages'
import { gt, translateAll } from './gt'

export const WRITTEN_BY_CLAUDE = ['ur', 'bn', 'or', 'gu', 'pa', 'mai']

if (import.meta.main) {
  const jobs = WRITTEN_BY_CLAUDE.flatMap((code) =>
    LANGUAGES[code].examples.flatMap(([en, t]) => [{ from: 'en', to: code, text: en }, { from: code, to: 'en', text: t }]),
  )
  await translateAll(jobs, 20_000)
  for (const code of WRITTEN_BY_CLAUDE) {
    console.log(`== ${code}`)
    for (const [en, t] of LANGUAGES[code].examples) console.log(`  mine: ${t}\n  GT:   ${gt('en', code, en)}\n  back: ${gt(code, 'en', t)}\n`)
  }
}
