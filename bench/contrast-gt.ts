// Corrupted pairs that read naturally, made with Google Translate. The English
// is changed in one known way and both versions are translated, so the good and
// the bad answer differ only by that change. GT is compared with GT, never with
// the human reference, so its own style and slips cancel out. A pair is dropped
// unless the change survived translation and stayed local; the drop count per
// language says where GT itself is weak.
//
//   bun bench/contrast-gt.ts [rows per kind = 20] [budget in new characters = 300000]
//
// Into English needs no GT: the output side is English, which is edited directly.
import { check, type Flag } from '../src/checks'
import { LANGUAGES, type Language } from '../src/languages'
import { CANDIDATES } from './candidates'
import { bumpDigit, dropClause, dropNegation, NEGATION, words } from './contrast'
import { gt, translateAll, uncached, type Job } from './gt'
import { in22Rows, spread, type Row } from './in22'

const perKind = Number(process.argv[2] ?? 20)
const budget = Number(process.argv[3] ?? 300_000)

const ANY: Flag[] = ['empty', 'untranslated', 'script', 'partial', 'markup', 'numbers', 'short', 'long', 'truncated']
/** Edit distance as a share of the longer text. */
function distance(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[y.length] / Math.max(1, x.length, y.length)
}

interface Planned {
  kind: string
  dir: 'from-en' | 'into-en'
  lang: Language
  source: string
  /** Builds the bad answer once GT has run, or null when the pair must be dropped. */
  bad: () => string | null
  expect: Flag[]
}

const rows = await in22Rows()
const shipped = Object.entries(CANDIDATES).filter(([, l]) => LANGUAGES[l.code] === l && l.code !== 'en')
const pick = (test: (r: Row) => boolean) => spread(rows.filter(test), perKind)

const jobs: Job[] = []
const plans: Planned[] = []
for (const [column, lang] of shipped) {
  const to = lang.code
  const forward = (text: string) => jobs.push({ from: 'en', to, text })
  const fromEn = (kind: string, source: string, bad: () => string | null, expect: Flag[]) =>
    plans.push({ kind, dir: 'from-en', lang, source, bad, expect })

  for (const r of pick((r) => /\d/.test(r.eng_Latn))) {
    const src = r.eng_Latn
    const changed = bumpDigit(src)!
    forward(src), forward(changed)
    fromEn('good (GT)', src, () => gt('en', to, src), [])
    fromEn('number (GT)', src, () => {
      const good = gt('en', to, src)
      const bad = gt('en', to, changed)
      // The change survived only if each answer carries its own source's numbers.
      const survived = !check(src, good, lang).includes('numbers') && !check(changed, bad, lang).includes('numbers')
      return survived && distance(good, bad) <= 0.2 ? bad : null
    }, ['numbers'])
  }

  for (const r of pick((r) => dropNegation(r.eng_Latn) !== null)) {
    const src = r.eng_Latn
    const changed = dropNegation(src)!
    forward(src), forward(changed)
    fromEn('negation (GT)', src, () => {
      const good = gt('en', to, src)
      const bad = gt('en', to, changed)
      // Back-translated, the good answer must still deny and the bad one not.
      const kept = NEGATION.test(gt(to, 'en', good)) && !NEGATION.test(gt(to, 'en', bad))
      return kept && distance(good, bad) <= 0.3 ? bad : null
    }, ANY)
  }

  for (const r of pick((r) => dropClause(r.eng_Latn) !== null)) {
    const src = r.eng_Latn
    const changed = dropClause(src)!
    forward(src), forward(changed)
    fromEn('clause (GT)', src, () => {
      const good = gt('en', to, src)
      const bad = gt('en', to, changed)
      return bad.length / good.length <= 0.8 ? bad : null
    }, ['short', 'truncated'])
  }

  for (const r of pick((r) => words(r.eng_Latn).length >= 12)) {
    const w = words(r.eng_Latn)
    const half = Math.ceil(w.length / 2)
    const head = w.slice(0, half).join(' ')
    forward(head)
    fromEn('half untranslated (GT)', r.eng_Latn, () => `${gt('en', to, head)} ${w.slice(half).join(' ')}`, ['partial', 'untranslated'])
  }

  // Into English: the answer is English, so the edit is made on it directly.
  for (const r of pick((r) => dropNegation(r.eng_Latn) !== null))
    plans.push({ kind: 'negation (en)', dir: 'into-en', lang: LANGUAGES.en, source: r[column], bad: () => dropNegation(r.eng_Latn), expect: ANY })
  for (const r of pick((r) => dropClause(r.eng_Latn) !== null))
    plans.push({ kind: 'clause (en)', dir: 'into-en', lang: LANGUAGES.en, source: r[column], bad: () => dropClause(r.eng_Latn), expect: ['short', 'truncated'] })
}

console.log(`forward: ${uncached(jobs)} new characters`)
await translateAll(jobs, budget)

// Back-translations for the negation pairs, now that the forward answers exist.
const back: Job[] = []
for (const [column, lang] of shipped)
  for (const r of pick((r) => dropNegation(r.eng_Latn) !== null)) {
    back.push({ from: lang.code, to: 'en', text: gt('en', lang.code, r.eng_Latn) })
    back.push({ from: lang.code, to: 'en', text: gt('en', lang.code, dropNegation(r.eng_Latn)!) })
    void column
  }
console.log(`back: ${uncached(back)} new characters`)
await translateAll(back, budget - uncached(jobs))

type Result = { plan: Planned; flags: Flag[] | null }
const results: Result[] = plans.map((plan) => {
  const bad = plan.bad()
  return { plan, flags: bad === null ? null : check(plan.source, bad, plan.lang) }
})
const kept = (xs: Result[]) => xs.filter((r) => r.flags !== null)
const caught = (r: Result) => (r.plan.expect.length ? r.flags!.some((f) => r.plan.expect.includes(f)) : r.flags!.length === 0)
const pct = (xs: Result[]) => (xs.length ? `${((100 * xs.filter(caught).length) / xs.length).toFixed(0)}%` : '—')

const kinds = [...new Set(plans.map((p) => p.kind))]
console.log(`\n${'kind'.padEnd(24)} ${'kept'.padStart(9)} ${'caught'.padStart(7)}   (good = share raising no flag)`)
for (const k of kinds) {
  const all = results.filter((r) => r.plan.kind === k)
  console.log(`${k.padEnd(24)} ${`${kept(all).length}/${all.length}`.padStart(9)} ${pct(kept(all)).padStart(7)}`)
}

console.log('\nBy language (kept, caught):')
for (const k of kinds) {
  const line = shipped.map(([c, l]) => {
    const xs = results.filter((r) => r.plan.kind === k && (r.plan.lang === l || (r.plan.dir === 'into-en' && r.plan.source && rows.some((row) => row[c] === r.plan.source))))
    return `${l.code} ${kept(xs).length}/${xs.length} ${pct(kept(xs))}`
  })
  console.log(`  ${k}: ${line.join(', ')}`)
}

const alarms = kept(results.filter((r) => r.plan.kind === 'good (GT)')).flatMap((r) => r.flags!)
console.log('\nFalse alarms on GT answers, by flag:', Object.fromEntries([...new Set(alarms)].map((f) => [f, alarms.filter((x) => x === f).length])))
