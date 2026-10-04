// Can a list of letter sequences catch a lost "not"? For each language, the
// sequences that mark negation are learned from IN22's human translations: the
// ones common where the English denies something and rare where it does not.
// The rule: the English denies, and the answer holds none of them.
//
// Learned on even rows; measured on odd rows and on the Google Translate pairs,
// which it never saw. No model is called.
//
//   bun bench/negation.ts
import { LANGUAGES } from '../src/languages'
import { CANDIDATES } from './candidates'
import { dropNegation, NEGATION } from './contrast'
import { gt } from './gt'
import { in22Rows, spread } from './in22'

const MAX_MARKERS = 12
const COVER = 0.95

/** Every letter sequence of 2 to 6 inside a word, word edges marked with `|`. */
function grams(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of text.toLowerCase().split(/[\s\p{P}]+/u).filter(Boolean)) {
    const s = `|${w}|`
    for (let n = 2; n <= 6; n++) for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n))
  }
  return out
}

/** Sequences enriched in negated rows, chosen greedily until they cover nearly all of them. */
function learn(neg: string[], plain: string[]): string[] {
  const df = (texts: string[]) => {
    const m = new Map<string, number>()
    for (const t of texts) for (const g of grams(t)) m.set(g, (m.get(g) ?? 0) + 1)
    return m
  }
  const dn = df(neg)
  const dp = df(plain)
  const ratio = (g: string) => ((dn.get(g) ?? 0) + 0.5) / (neg.length + 1) / (((dp.get(g) ?? 0) + 0.5) / (plain.length + 1))
  const candidates = [...dn.keys()].filter((g) => dn.get(g)! >= 3 && ratio(g) >= 3).sort((a, b) => ratio(b) - ratio(a))
  const markers: string[] = []
  let left = neg.map(grams)
  while (markers.length < MAX_MARKERS && left.length > neg.length * (1 - COVER)) {
    const best = candidates
      .filter((g) => !markers.includes(g))
      .map((g) => [g, left.filter((s) => s.has(g)).length * Math.log(ratio(g))] as const)
      .sort((a, b) => b[1] - a[1])[0]
    if (!best || best[1] <= 0) break
    markers.push(best[0])
    left = left.filter((s) => !s.has(best[0]))
  }
  return markers
}

const flags = (markers: string[], answer: string) => {
  const g = grams(answer)
  return !markers.some((m) => g.has(m))
}

const rows = await in22Rows()
const pct = (k: number, n: number) => (n ? `${((100 * k) / n).toFixed(0)}%`.padStart(4) : '   —')
console.log('lang  markers learned                                  | false alarm: human  GT | caught: GT, not lost')
for (const lang of Object.values(LANGUAGES).filter((l) => l.code !== 'en')) {
  const col = Object.keys(CANDIDATES).find((c) => CANDIDATES[c] === lang)!
  const train = rows.filter((_, i) => i % 2 === 0)
  const test = rows.filter((_, i) => i % 2 === 1)
  const markers = learn(
    train.filter((r) => NEGATION.test(r.eng_Latn)).map((r) => r[col]),
    train.filter((r) => !NEGATION.test(r.eng_Latn)).map((r) => r[col]),
  )

  const heldOut = test.filter((r) => NEGATION.test(r.eng_Latn)).map((r) => r[col])
  const humanAlarms = heldOut.filter((t) => flags(markers, t)).length

  let gtGood = 0, gtGoodAlarms = 0, gtBad = 0, gtBadCaught = 0
  for (const r of spread(rows.filter((x) => dropNegation(x.eng_Latn) !== null), 20)) {
    try {
      const good = gt('en', lang.code, r.eng_Latn)
      const bad = gt('en', lang.code, dropNegation(r.eng_Latn)!)
      if (!NEGATION.test(gt(lang.code, 'en', good)) || NEGATION.test(gt(lang.code, 'en', bad))) continue
      gtGood++, gtBad++
      if (flags(markers, good)) gtGoodAlarms++
      if (flags(markers, bad)) gtBadCaught++
    } catch {}
  }
  console.log(
    `${lang.code.padEnd(5)} ${markers.join(' ').slice(0, 48).padEnd(48)} | ${pct(humanAlarms, heldOut.length)} (${heldOut.length})  ${pct(gtGoodAlarms, gtGood)} | ${pct(gtBadCaught, gtBad)} (${gtBad})`,
  )
}
