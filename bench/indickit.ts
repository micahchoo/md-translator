// Battle tests for indickit (github.com/micahchoo/indickit) in the translator,
// before any of it ships. No model runs: every input is already on disk.
//
//   bun bench/indickit.ts names dev          the candidate "Name changed" check on IN22's
//                                            human pairs, even rows: false alarms, and
//                                            planted swaps and drops caught
//   bun bench/indickit.ts names test         the same on the odd rows; read once
//   bun bench/indickit.ts names pib          PIB's own translations of May 2021, false alarms
//                                            only; read once. Not November 2025: linguistic-
//                                            utilities tuned indickit's rules on it
//   bun bench/indickit.ts names-runs         the check on sarvam-30b's saved answers; flagged
//                                            blocks go to a file for reading by hand
//   bun bench/indickit.ts normalize          how often `normalize` changes text the
//                                            translator handles, and what it changes
//
// DEV chooses the variant; TEST and PIB check it. A second read of TEST or PIB
// needs `--again "<reason>"`, and each read is logged in corpus/runs/indickit/reads.log.
// Outputs go to corpus/runs/indickit/, which git ignores (IN22 and PIB text).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { RULES_VERSION as NORMALIZE_RULES, normalize } from 'indickit/normalize'
import { keys, RULES_VERSION as PHONETIC_RULES } from 'indickit/phonetic'
import { LANGUAGES } from '../src/languages'
import { CANDIDATES } from './candidates'
import { in22Rows, type Row } from './in22'

const DIR = 'corpus/runs/indickit'
const READS = `${DIR}/reads.log`
mkdirSync(DIR, { recursive: true })

// ---- the candidate check ----------------------------------------------------

/** How names are taken from the English side, and how many may go missing. */
interface Variant {
  name: string
  /** Also take acronyms (DRI, ISRO) as names. */
  caps: boolean
  /** Flag when any name is missing, or only when more than half are. */
  need: 'all' | 'half'
  /** Drop words a word list holds: 'common' drops "Port" (the list has "port"),
   *  'known' also drops "India" (the list has it capitalised). A spike: the
   *  list is 1 MB and cannot ship; it measures what a small one could reach. */
  dict?: 'common' | 'known'
  /** Keys also match when one starts with the other (3 classes or more), so an
   *  ending on either side (Sepoys, सिपाहियों) does not hide the name. */
  affix?: boolean
  /** Drop the words of the stop list mined on DEV (`stoplist`): small enough to ship. */
  stop?: boolean
}
const VARIANTS: Variant[] = [
  { name: 'title/all', caps: false, need: 'all' },
  { name: 'title/half', caps: false, need: 'half' },
  { name: 'title+caps/all', caps: true, need: 'all' },
  { name: 'common/all', caps: false, need: 'all', dict: 'common' },
  { name: 'known/all', caps: false, need: 'all', dict: 'known' },
  { name: 'known+affix/all', caps: false, need: 'all', dict: 'known', affix: true },
  { name: 'stop+affix/all', caps: false, need: 'all', stop: true, affix: true },
]

/** English words translated by meaning, not sound (India → भारत): mined from DEV
 *  alarms of `title/all` by `mineStoplist`, written once, read by TEST and PIB. */
const STOPLIST_FILE = `${DIR}/stoplist.json`
let STOP = new Set<string>()
/** A name missing from at least this share of its pairs, in at least this many sentences. */
const STOP_SHARE = 0.6
const STOP_ROWS = 3

const LIST = existsSync('/usr/share/dict/american-english') ? readFileSync('/usr/share/dict/american-english', 'utf8').split('\n') : []
const COMMON = new Set(LIST.filter((w) => /^\p{Ll}/u.test(w)))
const KNOWN = new Set(LIST.filter((w) => /^\p{Lu}/u.test(w)).map((w) => w.replace(/'s$/, '')))
const listed = (w: string, v: Variant) => !!v.dict && (COMMON.has(w.toLowerCase()) || (v.dict === 'known' && KNOWN.has(w)))

const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu
const TITLE = /^\p{Lu}\p{Ll}{2,}$/u
const CAPS = /^\p{Lu}{2,}$/u

/** The names in English text: title-case words that do not open a sentence,
 *  outside code. A word after a colon or an opening quote opens one too. */
export function names(english: string, v: Variant): string[] {
  const out: string[] = []
  for (const sentence of english.replace(/`[^`]*`/g, ' ').split(/(?<=[.!?:;…])\s+|\n+/)) {
    const ws = [...sentence.matchAll(WORD)]
    ws.forEach((m, i) => {
      const before = sentence.slice(0, m.index).trimEnd()
      if (i === 0 || /["“‘(\[]$/.test(before)) return
      if ((TITLE.test(m[0]) && !listed(m[0], v) && !(v.stop && STOP.has(m[0]))) || (v.caps && CAPS.test(m[0]))) out.push(m[0])
    })
  }
  return out
}

/** The word of `other` that carries `name`: itself in Latin letters, or a word
 *  that shares a phonetic key with it. Null when none does. */
export function carrier(name: string, other: string, v?: Variant): string | null {
  const lower = name.toLowerCase()
  const want = keys(name)
  const same = (a: string, b: string) => a === b || (!!v?.affix && Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)))
  for (const m of other.matchAll(WORD)) {
    if (m[0].toLowerCase() === lower) return m[0]
    if (keys(m[0]).some((k) => want.some((w) => same(k, w)))) return m[0]
  }
  return null
}

/** The check: the English side's names, and those the other side lacks. */
export function nameCheck(english: string, other: string, v: Variant): { names: string[]; missing: string[]; flag: boolean } {
  const ns = names(english, v)
  const missing = ns.filter((n) => !carrier(n, other, v))
  const flag = v.need === 'all' ? missing.length > 0 : missing.length * 2 > ns.length
  return { names: ns, missing, flag }
}

// ---- held-out reads ----------------------------------------------------------

function guard(set: string) {
  const again = process.argv.indexOf('--again')
  const read = existsSync(READS) && readFileSync(READS, 'utf8').split('\n').some((l) => l.split('\t')[1] === set)
  if (read && again < 0) throw new Error(`${set} was read before (${READS}); pass --again "<reason>" to read it again`)
  const reason = again < 0 ? 'first read' : process.argv[again + 1] ?? 'no reason given'
  appendFileSync(READS, [new Date().toISOString(), set, `phonetic ${PHONETIC_RULES}`, reason].join('\t') + '\n')
}

// ---- names on human pairs ---------------------------------------------------

/** Per variant: each variant counts its own names and damages its own first name. */
interface Tally {
  pairs: number
  /** Pairs where the variant finds a name. */
  withNames: Record<string, number>
  /** Untouched pairs flagged. */
  alarms: Record<string, number>
  /** Planted damage: copies made, and copies flagged. */
  swaps: Record<string, number>
  swapCaught: Record<string, number>
  drops: Record<string, number>
  dropCaught: Record<string, number>
}
type Count = Exclude<keyof Tally, 'pairs'>
const tally = (): Tally => ({ pairs: 0, withNames: {}, alarms: {}, swaps: {}, swapCaught: {}, drops: {}, dropCaught: {} })
const bump = (r: Record<string, number>, k: string) => (r[k] = (r[k] ?? 0) + 1)
const pct = (a = 0, b = 0) => (b ? ((100 * a) / b).toFixed(1).padStart(5) : '    –')

/** A native word that carries an English name, for use as a swap donor. */
interface Donor {
  name: string
  word: string
}

/** From the `i`th donor on, the first that `ok` accepts: a fixed, spread choice. */
const pick = <T,>(donors: T[], i: number, ok: (d: T) => boolean) => donors.slice(i % Math.max(1, donors.length)).concat(donors).find(ok)

/** The stop list, from DEV rows only: names that `title/all` finds missing in
 *  most of the pairs that hold them, across all languages, in at least
 *  STOP_ROWS sentences, so one sentence's rare name cannot enter it. */
function mineStoplist(rows: Row[]): string[] {
  const seen: Record<string, number> = {}
  const missed: Record<string, number> = {}
  const inRows: Record<string, Set<number>> = {}
  for (const [column, lang] of Object.entries(CANDIDATES)) {
    if (!LANGUAGES[lang.code] || lang.code === 'en') continue
    rows.forEach((row, i) => {
      const c = nameCheck(row.eng_Latn, row[column], VARIANTS[0])
      for (const n of c.names) bump(seen, n), (inRows[n] ??= new Set()).add(i)
      for (const n of c.missing) bump(missed, n)
    })
  }
  return Object.keys(seen).filter((n) => inRows[n].size >= STOP_ROWS && (missed[n] ?? 0) / seen[n] >= STOP_SHARE).sort()
}

async function namesIn22(split: 'dev' | 'test') {
  if (split === 'test') guard('names-in22-test')
  const all = await in22Rows()
  const rows = all.filter((_, i) => i % 2 === (split === 'dev' ? 0 : 1))
  if (split === 'dev') writeFileSync(STOPLIST_FILE, JSON.stringify(mineStoplist(rows)))
  loadStoplist()
  const result: Record<string, Tally> = {}
  const alarmNames: Record<string, Record<string, number>> = Object.fromEntries(VARIANTS.map((v) => [v.name, {}]))

  for (const [column, lang] of Object.entries(CANDIDATES)) {
    if (!LANGUAGES[lang.code] || lang.code === 'en') continue
    // Donors: names whose carrier word in this column is known, from all rows of the split.
    const donors: Donor[] = []
    const englishDonors: string[] = []
    for (const row of rows)
      for (const n of names(row.eng_Latn, VARIANTS[0])) {
        const w = carrier(n, row[column])
        if (w && !/[A-Za-z]/.test(w)) donors.push({ name: n, word: w })
        englishDonors.push(n)
      }

    for (const dir of ['from-en', 'into-en'] as const) {
      const t = (result[`${lang.code} ${dir}`] = tally())
      rows.forEach((row, i) => {
        const english = row.eng_Latn
        const native = row[column]
        t.pairs++
        for (const v of VARIANTS) {
          const clean = nameCheck(english, native, v)
          if (!clean.names.length) continue
          bump(t.withNames, v.name)
          if (clean.flag) {
            bump(t.alarms, v.name)
            for (const n of clean.missing) bump(alarmNames[v.name], n)
            continue // damage only pairs the variant passes
          }
          const target = clean.names[0]
          const word = carrier(target, native, v)!
          if (/[A-Za-z]/.test(word)) continue // kept in Latin letters: no native word to damage
          const want = new Set(keys(target))
          // Swap: the name's carrier becomes another name's. From English the damage
          // is in the native answer; into English it is in the English answer.
          // Drop: the carrier goes. A name dropped from an English answer leaves
          // nothing to look for, so into English a drop is caught only by chance.
          let bad: string | undefined
          let dropped: [string, string]
          if (dir === 'from-en') {
            const d = pick(donors, i, (x) => !carrier(target, x.word, v))
            if (d) bad = native.replace(word, d.word)
            if (bad) {
              bump(t.swaps, v.name)
              if (nameCheck(english, bad, v).flag) bump(t.swapCaught, v.name)
            }
            dropped = [english, native.replace(word, '').replace(/\s{2,}/g, ' ')]
          } else {
            const d = pick(englishDonors, i, (n) => !keys(n).some((k) => want.has(k)) && !carrier(n, native, v) && names(english.replace(target, n), v).includes(n))
            if (d) {
              bump(t.swaps, v.name)
              if (nameCheck(english.replace(target, d), native, v).flag) bump(t.swapCaught, v.name)
            }
            dropped = [english.replace(target, '').replace(/\s{2,}/g, ' '), native]
          }
          bump(t.drops, v.name)
          if (nameCheck(...dropped, v).flag) bump(t.dropCaught, v.name)
        }
      })
    }
  }
  report(`names, IN22 ${split.toUpperCase()} (${rows.length} rows), phonetic rules ${PHONETIC_RULES}`, result, split === 'dev' ? alarmNames : undefined)
  writeFileSync(`${DIR}/names-in22-${split}.json`, JSON.stringify({ phonetic: PHONETIC_RULES, variants: VARIANTS, result, alarmNames: split === 'dev' ? alarmNames : undefined }, null, 1))
}

function report(title: string, result: Record<string, Tally>, alarmNames?: Record<string, Record<string, number>>) {
  const sum = (key: Count | 'pairs', v: string, dir: string) =>
    Object.entries(result).filter(([k]) => k.endsWith(dir)).reduce((a, [, t]) => a + (key === 'pairs' ? t.pairs : t[key][v] ?? 0), 0)
  console.log(`\n${title}\nalarms: untouched pairs flagged, of those where the variant finds a name; caught: planted copies flagged\n`)
  for (const dir of ['from-en', 'into-en']) {
    if (!sum('pairs', '', dir)) continue
    console.log(`${dir}, ${sum('pairs', '', dir)} pairs`)
    console.log('variant           with names  alarms  swap caught  drop caught')
    for (const { name: v } of VARIANTS)
      console.log(`${v.padEnd(16)}  ${pct(sum('withNames', v, dir), sum('pairs', v, dir))}%     ${pct(sum('alarms', v, dir), sum('withNames', v, dir))}%  ${pct(sum('swapCaught', v, dir), sum('swaps', v, dir))}%       ${pct(sum('dropCaught', v, dir), sum('drops', v, dir))}%`)
    console.log()
  }
  console.log(`alarms per language: ${VARIANTS.map((v) => v.name).join(' / ')}`)
  for (const [k, t] of Object.entries(result)) if (k.endsWith('from-en')) console.log(`  ${k.split(' ')[0].padEnd(5)} ${VARIANTS.map((v) => pct(t.alarms[v.name], t.withNames[v.name])).join(' ')}`)
  if (alarmNames)
    for (const v of VARIANTS.slice(-2)) {
      const top = Object.entries(alarmNames[v.name]).sort((a, b) => b[1] - a[1]).slice(0, 30)
      console.log(`\nnames most often missing on untouched pairs, ${v.name} (DEV only):\n  ${top.map(([n, c]) => `${n} ${c}`).join(', ')}`)
    }
}

// ---- names on PIB's own translations (a second source, false alarms only) ---

function loadStoplist() {
  if (!existsSync(STOPLIST_FILE)) throw new Error(`no ${STOPLIST_FILE}: run "names dev" first`)
  STOP = new Set(JSON.parse(readFileSync(STOPLIST_FILE, 'utf8')))
  console.log(`stop list: ${STOP.size} words, ${readFileSync(STOPLIST_FILE).length} bytes`)
}

/** A PIB month no indickit rule was chosen on (pib-parallel's split may2021). */
const PIB_FRESH = '../pib-parallel/data/2021-05/sentences.jsonl'

function namesPib() {
  guard('names-pib')
  loadStoplist()
  type Sentence = { lang: string; en: string; text: string; sim: number; confidence: string }
  const result: Record<string, Tally> = {}
  for (const line of readFileSync(PIB_FRESH, 'utf8').split('\n')) {
    if (!line) continue
    const s = JSON.parse(line) as Sentence
    // The safest pairs only, as pib-bench.ts takes them: a weak aligner must not look like a lost name.
    if (s.sim < 0.85 || s.confidence !== 'normal' || !LANGUAGES[s.lang]) continue
    const t = (result[`${s.lang} from-en`] ??= tally())
    t.pairs++
    for (const v of VARIANTS) {
      const c = nameCheck(s.en, s.text, v)
      if (!c.names.length) continue
      bump(t.withNames, v.name)
      if (c.flag) bump(t.alarms, v.name)
    }
  }
  report(`names, PIB May 2021 (sim ≥ 0.85, normal confidence), phonetic rules ${PHONETIC_RULES}`, result)
  writeFileSync(`${DIR}/names-pib.json`, JSON.stringify({ phonetic: PHONETIC_RULES, variants: VARIANTS, result }, null, 1))
}

// ---- names on sarvam-30b's saved answers ------------------------------------

/** Each saved answer: its direction, language, source and answer. */
function* savedAnswers(): Generator<{ set: string; code: string; dir: string; source: string; output: string }> {
  const lines = (f: string) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  for (const f of readdirSync('corpus/runs/pairs').filter((f) => f.endsWith('.jsonl'))) {
    const lang = CANDIDATES[f.replace('.jsonl', '')]
    if (lang && LANGUAGES[lang.code]) for (const r of lines(`corpus/runs/pairs/${f}`)) if (r.output) yield { set: 'in22-runs', code: lang.code, dir: r.dir, source: r.source, output: r.output }
  }
  // Offered languages only: other sessions write candidates here too (mni).
  for (const f of readdirSync('corpus/runs/pib-bench').filter((f) => f.endsWith('.jsonl') && LANGUAGES[f.replace('.jsonl', '')]))
    for (const r of lines(`corpus/runs/pib-bench/${f}`)) if (r.output) yield { set: 'pib-runs', code: f.replace('.jsonl', ''), dir: 'from-en', source: r.source, output: r.output }
  for (const r of lines('corpus/runs/realdocs.jsonl')) if (r.output && LANGUAGES[r.code]) yield { set: 'realdocs', code: r.code, dir: 'from-en', source: r.source, output: r.output }
}

function namesRuns() {
  loadStoplist()
  const v = VARIANTS.find((x) => x.name === (process.argv[3] ?? 'stop+affix/all'))!
  const counts: Record<string, { n: number; withNames: number; flagged: number }> = {}
  const flagged: object[] = []
  for (const a of savedAnswers()) {
    const [english, other] = a.dir === 'from-en' ? [a.source, a.output] : [a.output, a.source]
    const c = nameCheck(english, other, v)
    const k = `${a.set} ${a.dir}`
    const t = (counts[k] ??= { n: 0, withNames: 0, flagged: 0 })
    t.n++
    if (c.names.length) t.withNames++
    if (c.flag) {
      t.flagged++
      flagged.push({ ...a, names: c.names, missing: c.missing, verdict: '' })
    }
  }
  console.log(`\nnames on sarvam-30b's saved answers, ${v.name}, phonetic rules ${PHONETIC_RULES}`)
  for (const [k, t] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${t.n} answers, ${t.withNames} with names, ${t.flagged} flagged (${pct(t.flagged, t.withNames)}% of those with names)`)
  writeFileSync(`${DIR}/names-runs-flagged.jsonl`, flagged.map((f) => JSON.stringify(f)).join('\n') + '\n')
  console.log(`\n${flagged.length} flagged answers in ${DIR}/names-runs-flagged.jsonl: fill each "verdict" with "real" or "false"`)
}

// ---- normalize --------------------------------------------------------------

/** Code points `b` has that `a` lacks and the reverse, as "+U+0D7B" and "−U+0D28 U+0D4D". */
function change(a: string, b: string): string {
  const count = (s: string) => [...s].reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map<string, number>())
  const ca = count(a)
  const cb = count(b)
  const hex = (c: string) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
  const lost = [...ca].filter(([c, n]) => (cb.get(c) ?? 0) < n).map(([c]) => hex(c))
  const won = [...cb].filter(([c, n]) => (ca.get(c) ?? 0) < n).map(([c]) => hex(c))
  return [lost.length ? '−' + lost.sort().join(' ') : '', won.length ? '+' + won.sort().join(' ') : ''].filter(Boolean).join(' ')
}

async function normalizeStage() {
  type Stat = { n: number; changed: number; kinds: Record<string, number>; distinct: Set<string>; distinctNorm: Set<string> }
  const stats: Record<string, Stat> = {}
  const examples: object[] = []
  const add = (set: string, code: string, text: string) => {
    if (!text || code === 'en') return
    const s = (stats[`${set} ${code}`] ??= { n: 0, changed: 0, kinds: {}, distinct: new Set(), distinctNorm: new Set() })
    const out = normalize(text, code)
    s.n++
    s.distinct.add(text)
    s.distinctNorm.add(out)
    if (out === text) return
    s.changed++
    const kind = change(text, out)
    bump(s.kinds, kind)
    if (s.kinds[kind] <= 3) examples.push({ set, code, kind, before: text, after: out })
  }

  // Human text, as a source to translate into English.
  const rows = await in22Rows()
  for (const [column, lang] of Object.entries(CANDIDATES)) if (LANGUAGES[lang.code]) for (const r of rows) add('in22', lang.code, r[column])
  for (const line of readFileSync('corpus/pib/pilot-v2/sentences.jsonl', 'utf8').split('\n')) {
    if (!line) continue
    const s = JSON.parse(line)
    if (LANGUAGES[s.lang]) add('pib', s.lang, s.text)
  }
  // The model's answers, as they would be copied and downloaded.
  for (const a of savedAnswers()) add(`sarvam ${a.set}`, a.dir === 'from-en' ? a.code : 'en', a.dir === 'from-en' ? a.output : a.source)
  // Text read from images.
  for (const f of ['pages-sauvola.jsonl', 'synthetic-sauvola.jsonl'])
    for (const l of readFileSync(`corpus/runs/ocr/${f}`, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(l)
      add(`ocr ${f.replace('.jsonl', '')}`, r.code, r.output)
    }

  console.log(`\nnormalize ${NORMALIZE_RULES}: blocks changed, and sources that become one edit-memory key\n`)
  console.log('set and language                 blocks  changed   keys merged   most common change')
  for (const [k, s] of Object.entries(stats).sort()) {
    const top = Object.entries(s.kinds).sort((a, b) => b[1] - a[1])[0]
    console.log(`${k.padEnd(32)} ${String(s.n).padStart(7)}  ${pct(s.changed, s.n)}%  ${String(s.distinct.size - s.distinctNorm.size).padStart(8)}      ${top ? `${top[0]} (${top[1]})` : ''}`)
  }
  writeFileSync(`${DIR}/normalize-examples.jsonl`, examples.map((e) => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(`${DIR}/normalize.json`, JSON.stringify({ normalize: NORMALIZE_RULES, stats: Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, { n: s.n, changed: s.changed, merged: s.distinct.size - s.distinctNorm.size, kinds: s.kinds }])) }, null, 1))
  console.log(`\nup to 3 examples of each change in ${DIR}/normalize-examples.jsonl`)
}

// ---- main ---------------------------------------------------------------------

if (import.meta.main) {
  const [stage, split] = process.argv.slice(2)
  if (stage === 'names' && (split === 'dev' || split === 'test')) await namesIn22(split)
  else if (stage === 'names' && split === 'pib') namesPib()
  else if (stage === 'names-runs') namesRuns()
  else if (stage === 'normalize') await normalizeStage()
  else console.log('usage: bun bench/indickit.ts names dev|test|pib | names-runs | normalize')
}
