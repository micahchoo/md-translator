// Tests the checks, not the model: each human IN22 pair is kept once as it is
// and copied once per corruption, and every copy goes through the app's own
// `check`. A corruption is made from human text, so its label is true by
// construction; no model writes either side.
//
//   bun bench/contrast.ts            all 1,024 rows, shipped languages
//
// Recall: the share of corrupted copies that raise a flag in the kind's set.
// False alarms: the share of untouched pairs that raise any flag at all.
import { check, type Flag } from '../src/checks'
import { LANGUAGES, type Language } from '../src/languages'
import { CANDIDATES } from './candidates'
import { in22Rows, type Row } from './in22'

export interface Item {
  kind: string
  dir: 'from-en' | 'into-en'
  column: string
  source: string
  output: string
  lang: Language
  /** Any of these counts as caught; empty for an untouched pair. */
  expect: Flag[]
}

const WRONG_LANGUAGE: Flag[] = ['untranslated', 'script', 'partial']

// The same sentence in another language of the same script: the error the
// script check cannot see. Hindi, Marathi and Nepali share Devanagari;
// Assamese and Bengali share one script; Urdu and Kashmiri share Arabic.
const SAME_SCRIPT: Record<string, string> = {
  hin_Deva: 'mar_Deva', mar_Deva: 'hin_Deva', npi_Deva: 'hin_Deva',
  asm_Beng: 'ben_Beng', ben_Beng: 'asm_Beng', urd_Arab: 'kas_Arab',
}
const otherScript = (col: string) => (/_(Deva|Arab)$/.test(col) ? 'ben_Beng' : 'hin_Deva')

export const words = (s: string) => s.split(/\s+/).filter(Boolean)

/** The first half of one text's words, then the second half of another's. */
export function halfAndHalf(first: string, second: string): string {
  const a = words(first)
  const b = words(second)
  return [...a.slice(0, Math.ceil(a.length / 2)), ...b.slice(Math.ceil(b.length / 2))].join(' ')
}

/** The first digit, in whatever script, moved on by one: 2016 becomes 3016. */
export function bumpDigit(s: string): string | null {
  const m = /\p{Nd}/u.exec(s)
  if (!m) return null
  const cp = m[0].codePointAt(0)!
  let zero = cp
  while (cp - zero < 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--
  const next = String.fromCodePoint(zero + ((cp - zero + 1) % 10))
  return s.slice(0, m.index) + next + s.slice(m.index + m[0].length)
}

// Straight and curly apostrophes: Google Translate writes "didn’t"; read as
// straight only, a kept negation once looked dropped.
export const NEGATION = /\b(?:not|never|no)\b|n['’]t\b/i

/** The sentence with its negation taken out, or null when it has none to take. */
export function dropNegation(s: string): string | null {
  const out = s
    .replace(/\bcan['’]t\b/gi, 'can')
    .replace(/\bwon['’]t\b/gi, 'will')
    .replace(/\b(\w+)n['’]t\b/gi, '$1')
    .replace(/\s+not\b/gi, '')
    .replace(/\bnever\s+/gi, '')
  return out !== s && !NEGATION.test(out) ? out : null
}

/** The sentence without its last comma clause, when that is a quarter to a half of it. */
export function dropClause(s: string): string | null {
  const at = s.lastIndexOf(', ')
  if (at < 0) return null
  const kept = s.slice(0, at).trimEnd()
  const share = kept.length / s.length
  return share >= 0.5 && share <= 0.75 ? `${kept}.` : null
}

/** Cut at a word boundary a little past half, as a stream that stopped. */
function cut(s: string): string {
  const w = words(s)
  return w.slice(0, Math.max(1, Math.floor(w.length * 0.55))).join(' ')
}

/** Markup carried over and then lost, three ways, chosen by row. */
function markup(i: number, src: string, out: string): [source: string, good: string, bad: string] {
  switch (i % 3) {
    case 0: return [`**${src}**`, `**${out}**`, out]
    case 1: return [`[${src}](#1)`, `[${out}](#1)`, `[${out}](#2)`]
    default: return [`${src} \`npm test\``, `${out} \`npm test\``, `${out} npm test`]
  }
}

export function corrupt(rows: Row[], column: string): Item[] {
  const items: Item[] = []
  const target = CANDIDATES[column]
  rows.forEach((row, i) => {
    const next = rows[(i + 1) % rows.length]
    for (const dir of ['from-en', 'into-en'] as const) {
      const [src, good, lang, srcCol, outCol] =
        dir === 'from-en'
          ? [row.eng_Latn, row[column], target, 'eng_Latn', column]
          : [row[column], row.eng_Latn, LANGUAGES.en, column, 'eng_Latn']
      const add = (kind: string, source: string, output: string, expect: Flag[]) =>
        items.push({ kind, dir, column, source, output, lang, expect })

      add('good', src, good, [])
      add('echo', src, src, ['untranslated', 'script'])
      add('other script', src, dir === 'from-en' ? row[otherScript(column)] : row[otherScript(column)], ['untranslated', 'script'])
      if (dir === 'from-en' && SAME_SCRIPT[column]) add('same script', src, row[SAME_SCRIPT[column]], WRONG_LANGUAGE)
      add('half untranslated', src, halfAndHalf(good, row[srcCol]), ['partial', 'untranslated'])
      const bumped = bumpDigit(good)
      if (bumped) add('number changed', src, bumped, ['numbers'])
      if (src.length >= 40) add('cut short', src, cut(good), ['short', 'truncated'])
      const [msrc, mgood, mbad] = markup(i, src, good)
      add('good', msrc, mgood, [])
      add('markup lost', msrc, mbad, ['markup'])
      add('text added', src, `${good} ${next[outCol]}`, ['long'])
    }
  })
  return items
}

if (import.meta.main) {
  const rows = await in22Rows()
  const shipped = Object.entries(CANDIDATES).filter(([, l]) => LANGUAGES[l.code] === l).map(([c]) => c)
  const items = shipped.flatMap((c) => corrupt(rows, c))
  const results = items.map((it) => ({ it, flags: check(it.source, it.output, it.lang) }))
  const caught = (r: (typeof results)[number]) =>
    r.it.expect.length ? r.flags.some((f) => r.it.expect.includes(f)) : r.flags.length === 0
  const pct = (xs: typeof results) => (xs.length ? `${((100 * xs.filter(caught).length) / xs.length).toFixed(1)}%` : '—')

  const kinds = [...new Set(items.map((i) => i.kind))]
  console.log(`${items.length} items from ${rows.length} rows x ${shipped.length} languages, both ways\n`)
  console.log(`${'kind'.padEnd(18)} ${'from-en'.padStart(8)} ${'into-en'.padStart(8)}   (good = share raising no flag)`)
  for (const k of kinds) {
    const of = (d: string) => results.filter((r) => r.it.kind === k && r.it.dir === d)
    console.log(`${k.padEnd(18)} ${pct(of('from-en')).padStart(8)} ${pct(of('into-en')).padStart(8)}`)
  }

  console.log('\nBelow 90%, by language:')
  for (const k of kinds)
    for (const d of ['from-en', 'into-en']) {
      const by = shipped
        .map((c) => [c, results.filter((r) => r.it.kind === k && r.it.dir === d && r.it.column === c)] as const)
        .filter(([, xs]) => xs.length && xs.filter(caught).length / xs.length < 0.9)
      if (by.length) console.log(`  ${k} ${d}: ${by.map(([c, xs]) => `${c} ${pct(xs)}`).join(', ')}`)
    }

  const falseAlarms = results.filter((r) => r.it.kind === 'good' && r.flags.length)
  const byFlag = new Map<string, number>()
  for (const r of falseAlarms) for (const f of r.flags) byFlag.set(`${r.it.dir} ${f}`, (byFlag.get(`${r.it.dir} ${f}`) ?? 0) + 1)
  console.log('\nFalse alarms on untouched pairs, by flag:', Object.fromEntries([...byFlag].sort((a, b) => b[1] - a[1])))
}
