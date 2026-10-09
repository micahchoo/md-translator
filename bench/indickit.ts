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
//   bun bench/indickit.ts normalize-mt       does `normalize` change the translation? Each
//                                            block it changes goes into English raw and
//                                            normalized (model at :8086), scored by chrF.
//                                            Resumes; answers in normalize-mt.jsonl
//   bun bench/indickit.ts typed              does sarvam-30b read Indian text typed in Latin letters?
//                                            IN22 rows of every language, written in Latin by
//                                            `romanize`, and Dakshina's human typing for 11, go
//                                            into English as typed, written back in the script by
//                                            `deromanize`, and as the original (model at :8086).
//                                            Resumes; answers in typed-mt.jsonl
//   bun bench/indickit.ts wellformed         pdf.ts's damaged-page rule against job 17's
//                                            is_well_formed (Python, linguistic-utilities),
//                                            on the DEV half of job 4's real PDFs, read by pdf.js
//
// DEV chooses the variant; TEST and PIB check it. A second read of TEST or PIB
// needs `--again "<reason>"`, and each read is logged in corpus/runs/indickit/reads.log.
// Outputs go to corpus/runs/indickit/, which git ignores (IN22 and PIB text).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { RULES_VERSION as NORMALIZE_RULES, normalize } from 'indickit/normalize'
import { keys, RULES_VERSION as PHONETIC_RULES } from 'indickit/phonetic'
import { loadSearch, SEARCH_VERSION, type Search } from 'indickit/phonetic-search'
import { LANGUAGES } from '../src/languages'
import { damage, layerText, pageVerdict } from '../src/pdf'
import { CANDIDATES } from './candidates'
import { $ } from 'bun'
import { createClient } from '../src/llm'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'
import { in22Rows, spread, type Row } from './in22'

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
  /** Match with `phonetic-search`'s scorer (0.8.0) in place of the key alone: the
   *  answer's words are indexed as a text, and a name is carried by the best word
   *  scoring at least this (THRESHOLDS.text_10 = 80, text_20 = 70). */
  search?: number
}
const VARIANTS: Variant[] = [
  { name: 'title/all', caps: false, need: 'all' },
  { name: 'title/half', caps: false, need: 'half' },
  { name: 'title+caps/all', caps: true, need: 'all' },
  { name: 'common/all', caps: false, need: 'all', dict: 'common' },
  { name: 'known/all', caps: false, need: 'all', dict: 'known' },
  { name: 'known+affix/all', caps: false, need: 'all', dict: 'known', affix: true },
  { name: 'stop+affix/all', caps: false, need: 'all', stop: true, affix: true },
  { name: 'search80/all', caps: false, need: 'all', search: 80 },
  { name: 'stop+search80/all', caps: false, need: 'all', stop: true, search: 80 },
  { name: 'stop+search70/all', caps: false, need: 'all', stop: true, search: 70 },
]

/** The scorer's tables for each offered language (2–6 KB each), from jsDelivr. */
const SEARCH: Record<string, Search> = {}
async function loadSearches() {
  if (!VARIANTS.some((v) => v.search)) return
  for (const code of Object.keys(LANGUAGES)) if (code !== 'en' && !SEARCH[code]) SEARCH[code] = await loadSearch(code)
  console.log(`phonetic-search ${SEARCH_VERSION}, ${Object.keys(SEARCH).length} languages`)
}

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
 *  that shares a phonetic key with it (or, for a `search` variant, that the
 *  scorer ranks at the threshold). Null when none does. */
export function carrier(name: string, other: string, v?: Variant, code?: string): string | null {
  const lower = name.toLowerCase()
  const ws = [...other.matchAll(WORD)].map((m) => m[0])
  const exact = ws.find((w) => w.toLowerCase() === lower)
  if (exact) return exact
  if (v?.search) {
    const s = code && SEARCH[code]
    if (!s) throw new Error(`no phonetic-search table for ${code}: call loadSearches first`)
    const hit = s.index(ws, 'text').search(name, v.search)[0]
    return hit ? ws[hit.name] : null
  }
  const want = keys(name)
  const same = (a: string, b: string) => a === b || (!!v?.affix && Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)))
  return ws.find((w) => keys(w).some((k) => want.some((x) => same(k, x)))) ?? null
}

/** The check: the English side's names, and those the other side lacks. */
export function nameCheck(english: string, other: string, v: Variant, code?: string): { names: string[]; missing: string[]; flag: boolean } {
  const ns = names(english, v)
  const missing = ns.filter((n) => !carrier(n, other, v, code))
  const flag = v.need === 'all' ? missing.length > 0 : missing.length * 2 > ns.length
  return { names: ns, missing, flag }
}

// ---- held-out reads ----------------------------------------------------------

function guard(set: string) {
  const again = process.argv.indexOf('--again')
  const read = existsSync(READS) && readFileSync(READS, 'utf8').split('\n').some((l) => l.split('\t')[1] === set)
  if (read && again < 0) throw new Error(`${set} was read before (${READS}); pass --again "<reason>" to read it again`)
  const reason = again < 0 ? 'first read' : process.argv[again + 1] ?? 'no reason given'
  appendFileSync(READS, [new Date().toISOString(), set, `phonetic ${PHONETIC_RULES} search ${SEARCH_VERSION}`, reason].join('\t') + '\n')
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
      const c = nameCheck(row.eng_Latn, row[column], VARIANTS[0], lang.code)
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
  await loadSearches()
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
          const clean = nameCheck(english, native, v, lang.code)
          if (!clean.names.length) continue
          bump(t.withNames, v.name)
          if (clean.flag) {
            bump(t.alarms, v.name)
            for (const n of clean.missing) bump(alarmNames[v.name], n)
            continue // damage only pairs the variant passes
          }
          const target = clean.names[0]
          const word = carrier(target, native, v, lang.code)!
          if (/[A-Za-z]/.test(word)) continue // kept in Latin letters: no native word to damage
          const want = new Set(keys(target))
          // Swap: the name's carrier becomes another name's. From English the damage
          // is in the native answer; into English it is in the English answer.
          // Drop: the carrier goes. A name dropped from an English answer leaves
          // nothing to look for, so into English a drop is caught only by chance.
          let bad: string | undefined
          let dropped: [string, string]
          if (dir === 'from-en') {
            const d = pick(donors, i, (x) => !carrier(target, x.word, v, lang.code))
            if (d) bad = native.replace(word, d.word)
            if (bad) {
              bump(t.swaps, v.name)
              if (nameCheck(english, bad, v, lang.code).flag) bump(t.swapCaught, v.name)
            }
            dropped = [english, native.replace(word, '').replace(/\s{2,}/g, ' ')]
          } else {
            const d = pick(englishDonors, i, (n) => !keys(n).some((k) => want.has(k)) && !carrier(n, native, v, lang.code) && names(english.replace(target, n), v).includes(n))
            if (d) {
              bump(t.swaps, v.name)
              if (nameCheck(english.replace(target, d), native, v, lang.code).flag) bump(t.swapCaught, v.name)
            }
            dropped = [english.replace(target, '').replace(/\s{2,}/g, ' '), native]
          }
          bump(t.drops, v.name)
          if (nameCheck(...dropped, v, lang.code).flag) bump(t.dropCaught, v.name)
        }
      })
    }
  }
  report(`names, IN22 ${split.toUpperCase()} (${rows.length} rows), phonetic rules ${PHONETIC_RULES}, search ${SEARCH_VERSION}`, result, split === 'dev' ? alarmNames : undefined)
  writeFileSync(`${DIR}/names-in22-${split}.json`, JSON.stringify({ phonetic: PHONETIC_RULES, search: SEARCH_VERSION, variants: VARIANTS, result, alarmNames: split === 'dev' ? alarmNames : undefined }, null, 1))
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

async function namesPib() {
  guard('names-pib')
  loadStoplist()
  await loadSearches()
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
      const c = nameCheck(s.en, s.text, v, s.lang)
      if (!c.names.length) continue
      bump(t.withNames, v.name)
      if (c.flag) bump(t.alarms, v.name)
    }
  }
  report(`names, PIB May 2021 (sim ≥ 0.85, normal confidence), phonetic rules ${PHONETIC_RULES}, search ${SEARCH_VERSION}`, result)
  writeFileSync(`${DIR}/names-pib.json`, JSON.stringify({ phonetic: PHONETIC_RULES, search: SEARCH_VERSION, variants: VARIANTS, result }, null, 1))
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

async function namesRuns() {
  loadStoplist()
  await loadSearches()
  const v = VARIANTS.find((x) => x.name === (process.argv[3] ?? 'stop+affix/all'))!
  const counts: Record<string, { n: number; withNames: number; flagged: number }> = {}
  const flagged: object[] = []
  for (const a of savedAnswers()) {
    const [english, other] = a.dir === 'from-en' ? [a.source, a.output] : [a.output, a.source]
    const c = nameCheck(english, other, v, a.code)
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

// ---- normalize and the translation ------------------------------------------

/** Changed sentences of each language taken from PIB, at most this many. */
const PIB_PER_LANGUAGE = 30

async function normalizeMt() {
  type Job = { set: string; code: string; id: string; text: string; reference: string }
  const jobs: Job[] = []
  // Text read from images, in the languages the app reads from images.
  const rows = spread(await in22Rows(), 20)
  for (const l of readFileSync('corpus/runs/ocr/synthetic-sauvola.jsonl', 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l)
    if (r.code !== 'en' && LANGUAGES[r.code]?.ocr && normalize(r.output, r.code) !== r.output)
      jobs.push({ set: 'ocr', code: r.code, id: `${r.cond}-${r.i}`, text: r.output, reference: rows[r.i].eng_Latn })
  }
  // Text pasted from the web: PIB's own translations, the safest pairs.
  const pib: Record<string, Job[]> = {}
  for (const line of readFileSync('corpus/pib/pilot-v2/sentences.jsonl', 'utf8').split('\n')) {
    if (!line) continue
    const s = JSON.parse(line)
    if (s.sim < 0.85 || s.confidence !== 'normal' || !LANGUAGES[s.lang] || normalize(s.text, s.lang) === s.text) continue
    const list = (pib[s.lang] ??= [])
    list.push({ set: 'pib', code: s.lang, id: `${s.prid}-${list.length}`, text: s.text, reference: s.en })
  }
  // Evenly through the month, as `spread` takes IN22's rows.
  for (const list of Object.values(pib)) jobs.push(...list.filter((_, i) => i % Math.max(1, Math.floor(list.length / PIB_PER_LANGUAGE)) === 0).slice(0, PIB_PER_LANGUAGE))

  const out = `${DIR}/normalize-mt.jsonl`
  const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.set} ${r.code} ${r.id}` }) : [])
  const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
  const opts = { ...toOptions({ ...DEFAULTS, language: 'en' }), language: LANGUAGES.en, examples: [] }
  const english = async (md: string) => (await translateDocument(md, opts, complete, () => {})).units.map((u) => u.output).join(' ')
  console.log(`${jobs.length} blocks, ${done.size} done`)
  for (const j of jobs) {
    if (done.has(`${j.set} ${j.code} ${j.id}`)) continue
    const raw = await english(j.text)
    const normalized = await english(normalize(j.text, j.code))
    appendFileSync(out, JSON.stringify({ ...j, raw, normalized, same: raw === normalized }) + '\n')
  }
  // chrF per set and language, raw against normalized, on the same blocks.
  console.log(await $`uv run --quiet --with sacrebleu python -c ${`
import json, collections
from sacrebleu.metrics import CHRF
rows = [json.loads(l) for l in open('${out}')]
by = collections.defaultdict(list)
for r in rows: by[(r['set'], r['code'])].append(r); by[(r['set'], 'all')].append(r)
print('set  lang    n  same  chrF raw  chrF normalized')
for (s, c), rs in sorted(by.items()):
    refs = [[r['reference'] for r in rs]]
    a = CHRF().corpus_score([r['raw'] for r in rs], refs).score
    b = CHRF().corpus_score([r['normalized'] for r in rs], refs).score
    print(f"{s:4} {c:5} {len(rs):4} {sum(r['same'] for r in rs):5}  {a:8.1f}  {b:8.1f}")`}`.text())
}

// ---- Indian text typed in Latin letters, as a source ---------------------------

/** Sentences of each language, from IN22 and from Dakshina. */
const TYPED_ROWS = 20
/** Google's Dakshina: Wikipedia sentences romanized by native speakers, 11 languages.
 *  Its `dev` split only: indickit measured `romanize` and `deromanize` on `test`. */
const DAKSHINA = '../linguistic-utilities/data/dakshina/dakshina_dataset_v1.0'
const DAKSHINA_LANGS = ['bn', 'gu', 'hi', 'kn', 'ml', 'mr', 'pa', 'sd', 'ta', 'te', 'ur']
/** Typed text: no letter of an Indian script is left in it. */
const isTyped = (t: string) => !/(?![\x00-\x7F])[\p{L}\p{M}]/u.test(t)

/** Does sarvam-30b read Indian text typed in Latin letters, and does `deromanize`
 *  help? Each sentence goes into English three ways: as typed, written back in the
 *  script by `deromanize`, and the original. IN22 has an English reference (chrF);
 *  Dakshina has none, so there the original's answer stands as the reference.
 *  IN22's typing is `romanize`'s one spelling, so its "back" arm is a round trip
 *  of sibling tables and flatters `deromanize`; Dakshina's typing is real. */
async function typed() {
  type Job = { set: 'in22' | 'dakshina'; code: string; id: string; native: string; latin: string; back?: string; reference?: string }
  const out = `${DIR}/typed-mt.jsonl`
  const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.set} ${r.code} ${r.id}` }) : [])
  const jobs: Job[] = []
  const rows = spread(await in22Rows(), TYPED_ROWS)
  const { load: loadRomanizer, CDN: ROMANIZE_CDN } = await import('indickit/romanize')
  const { load: loadDeromanizer, CDN: DEROMANIZE_CDN, RULES_VERSION: DEROMANIZE_RULES } = await import('indickit/deromanize')
  for (const [column, lang] of Object.entries(CANDIDATES)) {
    if (!LANGUAGES[lang.code] || lang.code === 'en') continue
    const r = await loadRomanizer(lang.code, 'words', { base: ROMANIZE_CDN })
    // A row counts only when the romanizer wrote every word in Latin letters. IN22
    // writes Sindhi in Devanagari and indickit's Sindhi tables read Perso-Arabic, so
    // no Sindhi row counts; Dakshina (Perso-Arabic) stands for Sindhi.
    rows.forEach((row, i) => {
      const latin = r.text(row[column])
      if (isTyped(latin)) jobs.push({ set: 'in22', code: lang.code, id: String(i), native: row[column], latin, reference: row.eng_Latn })
    })
  }
  for (const code of DAKSHINA_LANGS) {
    if (!LANGUAGES[code]) continue
    const file = (side: string) => readFileSync(`${DAKSHINA}/${code}/romanized/${code}.romanized.rejoined.dev.${side}.txt`, 'utf8').split('\n')
    const native = file('native')
    const roman = file('roman')
    const lines = native.map((_, i) => i).filter((i) => native[i].trim() && roman[i]?.trim())
    for (const i of spread(lines, TYPED_ROWS)) jobs.push({ set: 'dakshina', code, id: String(i), native: native[i], latin: roman[i] })
  }
  // Written back one language at a time: a language's tables take tens of MB parsed.
  const pending = jobs.filter((j) => !done.has(`${j.set} ${j.code} ${j.id}`))
  for (const code of [...new Set(pending.map((j) => j.code))]) {
    const d = await loadDeromanizer(code, 'words', { base: DEROMANIZE_CDN })
    for (const j of pending) if (j.code === code) j.back = d.text(j.latin)
  }
  console.log(`deromanize ${DEROMANIZE_RULES}: ${jobs.length} sentences, ${done.size} done`)

  const raw = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
  // The server drops an idle kept-alive socket now and then (ECONNRESET on another client's run): ask again.
  const complete: typeof raw = async (...args) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await raw(...args)
      } catch (e) {
        if (attempt >= 2) throw e
      }
    }
  }
  // One answer per arm, no retries: the model as it is, with the flags it would raise.
  const opts = { ...toOptions({ ...DEFAULTS, language: 'en' }), language: LANGUAGES.en, examples: [], retries: 0 }
  const english = async (md: string) => {
    const p = await translateDocument(md, opts, complete, () => {})
    return { text: p.units.map((u) => u.output).join(' '), flags: p.units.flatMap((u) => u.flags) }
  }
  for (const j of pending) {
    const [typed, back, native] = [await english(j.latin), await english(j.back!), await english(j.native)]
    appendFileSync(out, JSON.stringify({ ...j, en_typed: typed.text, en_back: back.text, en_native: native.text, flags: { typed: typed.flags, back: back.flags, native: native.flags } }) + '\n')
  }

  console.log(await $`uv run --quiet --with sacrebleu python -c ${`
import json, collections, re
from sacrebleu.metrics import CHRF
chrf = lambda hyps, refs: CHRF().corpus_score(hyps, [refs]).score
rows = [r for r in (json.loads(l) for l in open('${out}')) if all(ord(c) < 128 for c in r['latin'] if c.isalpha())]
by = collections.defaultdict(list)
for r in rows: by[(r['set'], r['code'])].append(r)
strip = lambda w: re.sub(r'[^\\w]', '', w)
def roundtrip(rs):
    pairs = [(strip(a), strip(b)) for r in rs for a, b in zip(r['native'].split(), r['back'].split())]
    pairs = [(a, b) for a, b in pairs if a]
    return 100 * sum(a == b for a, b in pairs) / max(1, len(pairs))
print('echo: the answer to the typed text is still the typed text (chrF against it >= 50)')
print('chrF against the English reference (IN22) or against the original\\'s answer (Dakshina)')
print('set      lang    n  echo%  typed   back  original  back=original word%')
for (s, c), rs in sorted(by.items()):
    ref = [r['reference'] if s == 'in22' else r['en_native'] for r in rs]
    echo = 100 * sum(CHRF().sentence_score(r['en_typed'], [r['latin']]).score >= 50 for r in rs) / len(rs)
    orig = f"{chrf([r['en_native'] for r in rs], ref):8.1f}" if s == 'in22' else '       –'
    print(f"{s:8} {c:5} {len(rs):3}  {echo:5.0f}  {chrf([r['en_typed'] for r in rs], ref):5.1f}  {chrf([r['en_back'] for r in rs], ref):5.1f}  {orig}  {roundtrip(rs):6.1f}")`}`.text())
}

// ---- is_well_formed against pdf.ts's damaged-page rule -------------------------

const LU = '../linguistic-utilities'
/** Job 4's real PDFs, and job 17's split of them: only `dev` is read here. */
const PDF_INDEXES = [`${LU}/data/pdf-spike/real/all/index.jsonl`, `${LU}/data/pdf-spike/real/first/index.jsonl`]
const PDF_LANG: Record<string, string> = { hin: 'hi', mar: 'mr', ben: 'bn', pan: 'pa', guj: 'gu', ori: 'or', tam: 'ta', tel: 'te', kan: 'kn', mal: 'ml', urd: 'ur' }
/** As wellformed_pdf.py#MAX_PAGES: a long book adds words, not producers. */
const MAX_PAGES = 40
/** wellformed_pdf.py#half: a hash of the Internet Archive collection. */
const half = (coll: string) => (Bun.hash.crc32(`wellformed:${coll}`) % 2 ? 'held' : 'dev')

async function wellformed() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const seen = new Set<string>()
  const pages: { file: string; coll: string; code: string; page: number; verdict: string; damage: number; text: string }[] = []
  for (const idx of PDF_INDEXES)
    for (const line of readFileSync(idx, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line)
      if (seen.has(r.file) || half(r.coll) !== 'dev' || !PDF_LANG[r.lang]) continue
      seen.add(r.file)
      const code = PDF_LANG[r.lang]
      try {
        const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(r.file)), verbosity: 0 })
        const pdf = await task.promise
        for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
          const items = (await (await pdf.getPage(n)).getTextContent()).items.flatMap((i: any) => ('str' in i ? [{ str: i.str, hasEOL: i.hasEOL, transform: i.transform, height: i.height }] : []))
          const text = layerText(items)
          pages.push({ file: r.file, coll: r.coll, code, page: n, verdict: pageVerdict(text, code), damage: damage(text), text })
        }
        await task.destroy()
      } catch (e) {
        console.log(`skipped ${r.file}: ${(e as Error).message}`)
      }
    }
  const input = `${DIR}/wellformed-pages.jsonl`
  writeFileSync(input, pages.map((p) => JSON.stringify(p)).join('\n') + '\n')
  console.log(`${seen.size} DEV PDFs, ${pages.length} pages read by pdf.js`)

  // The answer key: job 17's is_well_formed on each word (100% agreement with HarfBuzz there).
  const labelled = `${DIR}/wellformed-labelled.jsonl`
  await $`uv run --quiet python -c ${`
import json, sys, unicodedata
from jobs.normalize.wellformed import is_well_formed
with open(sys.argv[1]) as f, open(sys.argv[2], 'w') as out:
    for line in f:
        p = json.loads(line)
        # A lone vowel sign is a word too: pdf.js can put a space inside a word (च ां).
        words = [w for w in p.pop('text').split() if any(unicodedata.category(c)[0] in 'LM' for c in w)]
        bad = [w for w in words if not is_well_formed(w, p['code'])]
        out.write(json.dumps({**p, 'words': len(words), 'broken': len(bad), 'examples': bad[:3]}, ensure_ascii=False) + chr(10))
`} ${process.cwd()}/${input} ${process.cwd()}/${labelled}`.cwd(LU)

  // A page is broken, by the answer key, when this share of its words is.
  const SHARES = [0.005, 0.01, 0.02, 0.05]
  const rows = readFileSync(labelled, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((p) => p.verdict === 'layer' || p.verdict === 'damaged')
  console.log(`\n${rows.length} pages pdf.ts judged on syllables (layer or damaged); the rest were empty or another script`)
  console.log('broken if share >   pages broken   pdf.ts flags   both   missed   false alarms')
  for (const t of SHARES) {
    const truth = (p: any) => p.words > 0 && p.broken / p.words > t
    const flag = (p: any) => p.verdict === 'damaged'
    const n = (f: (p: any) => boolean) => rows.filter(f).length
    console.log(`${(t * 100).toFixed(1).padStart(14)}%   ${String(n(truth)).padStart(12)}   ${String(n(flag)).padStart(12)}   ${String(n((p) => truth(p) && flag(p))).padStart(4)}   ${String(n((p) => truth(p) && !flag(p))).padStart(6)}   ${String(n((p) => !truth(p) && flag(p))).padStart(12)}`)
  }
  const byLang: Record<string, { pages: number; words: number; broken: number; flagged: number }> = {}
  for (const p of rows) {
    const s = (byLang[p.code] ??= { pages: 0, words: 0, broken: 0, flagged: 0 })
    s.pages++, (s.words += p.words), (s.broken += p.broken), (s.flagged += p.verdict === 'damaged' ? 1 : 0)
  }
  console.log('\nlanguage  pages  words broken  pages flagged by pdf.ts')
  for (const [c, s] of Object.entries(byLang)) console.log(`${c.padEnd(8)}  ${String(s.pages).padStart(5)}  ${pct(s.broken, s.words)}%       ${pct(s.flagged, s.pages)}%`)
}

// ---- main ---------------------------------------------------------------------

if (import.meta.main) {
  const [stage, split] = process.argv.slice(2)
  if (stage === 'names' && (split === 'dev' || split === 'test')) await namesIn22(split)
  else if (stage === 'names' && split === 'pib') await namesPib()
  else if (stage === 'names-runs') await namesRuns()
  else if (stage === 'normalize') await normalizeStage()
  else if (stage === 'normalize-mt') await normalizeMt()
  else if (stage === 'typed') await typed()
  else if (stage === 'wellformed') await wellformed()
  else console.log('usage: bun bench/indickit.ts names dev|test|pib | names-runs | normalize | normalize-mt | typed | wellformed')
}
