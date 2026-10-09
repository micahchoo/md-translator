// Builds src/typed-detect.json, the model that tells typed Indian text from English
// and names its language (src/detect.ts), and measures it.
//
//   bun bench/detect-typed.ts          build from the training lines; choose the size and
//                                      the margin on DEV; write the model
//   bun bench/detect-typed.ts test     the chosen model on the TEST lines; read once,
//                                      logged in corpus/runs/indickit/reads.log
//
// Lines of each source by index: 0 and 2 of every 4 train, 1 is DEV, 3 is TEST.
// Sources: Dakshina's dev split (Wikipedia sentences typed by native speakers; its
// test split is indickit's held-out data and is never read); IN22 sentences written
// in Latin letters by indickit's `romanize` (one spelling, so cleaner than typing);
// IN22's English. Languages: the ten a source can be typed in (src/typed.ts) and English.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CDN, load } from 'indickit/romanize'
import { detect, grams, type Model } from '../src/detect'
import { TYPED } from '../src/typed'
import { CANDIDATES } from './candidates'
import { in22Rows } from './in22'

const OUT = 'src/typed-detect.json'
const READS = 'corpus/runs/indickit/reads.log'
/** linguistic-utilities, beside this repository; LU_DIR points elsewhere (a worktree). */
const LU = process.env.LU_DIR ?? '../linguistic-utilities'
const DAKSHINA = `${LU}/data/dakshina/dakshina_dataset_v1.0`
const DAKSHINA_LANGS = ['bn', 'gu', 'hi', 'kn', 'ml', 'mr', 'pa', 'sd', 'ta', 'te', 'ur']
const SIZES = [800, 1500, 3000]
/** At most this share of English DEV sentences may be taken for typed text. */
const ENGLISH_WRONG = 0.01

type Split = 'train' | 'dev' | 'test'
const splitOf = (i: number): Split => (i % 4 === 1 ? 'dev' : i % 4 === 3 ? 'test' : 'train')
const typed = (t: string) => !/(?![\x00-\x7F])[\p{L}\p{M}]/u.test(t)

async function data(): Promise<Record<string, Record<Split, string[]>>> {
  const d: Record<string, Record<Split, string[]>> = {}
  const add = (key: string, i: number, s: string) => ((d[key] ??= { train: [], dev: [], test: [] })[splitOf(i)].push(s))
  const rows = await in22Rows()
  rows.forEach((r, i) => add('in22 en', i, r.eng_Latn))
  for (const [column, lang] of Object.entries(CANDIDATES)) {
    if (!TYPED.includes(lang.code)) continue
    const r = await load(lang.code, 'words', { base: CDN })
    let n = 0
    for (const row of rows) {
      const latin = r.text(row[column])
      if (typed(latin)) add(`in22 ${lang.code}`, n++, latin)
    }
  }
  for (const code of DAKSHINA_LANGS) {
    if (!TYPED.includes(code)) continue
    readFileSync(`${DAKSHINA}/${code}/romanized/${code}.romanized.rejoined.dev.roman.txt`, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .forEach((l, i) => add(`dakshina ${code}`, i, l))
  }
  return d
}

const langOf = (key: string) => key.split(' ')[1]

function train(d: Record<string, Record<Split, string[]>>, k: number): Model {
  const counts: Record<string, Map<string, number>> = {}
  for (const [key, splits] of Object.entries(d)) {
    const c = (counts[langOf(key)] ??= new Map())
    for (const s of splits.train) for (const g of grams(s)) c.set(g, (c.get(g) ?? 0) + 1)
  }
  const langs: Model['langs'] = {}
  for (const [lang, c] of Object.entries(counts)) {
    const top = [...c].sort((a, b) => b[1] - a[1]).slice(0, k)
    langs[lang] = { grams: top.map(([g]) => g).join('\n'), counts: top.map(([, n]) => n), total: [...c.values()].reduce((a, b) => a + b, 0), vocab: c.size }
  }
  return { version: new Date().toISOString().slice(0, 10), margin: 0, langs }
}

/** Per source: English told from Indian text, the language named, and at the margin, typed text caught. */
function measure(model: Model, d: Record<string, Record<Split, string[]>>, split: Split) {
  console.log(`\n${split.toUpperCase()}, ${Object.keys(model.langs).length} languages, top ${model.langs.en.counts.length} n-grams each, margin ${model.margin.toFixed(3)}`)
  console.log('source    lang     n   english-vs-indic%   language%   caught at margin%   paragraphs of 5: language%')
  for (const [key, splits] of Object.entries(d).sort()) {
    const lang = langOf(key)
    const lines = splits[split]
    let binary = 0, named = 0, caught = 0, paragraphs = 0, named5 = 0
    for (const s of lines) {
      const v = detect(model, s)
      const isIndic = !!v && v.margin >= model.margin
      binary += isIndic === (lang !== 'en') ? 1 : 0
      named += v?.lang === lang ? 1 : 0
      caught += isIndic ? 1 : 0
    }
    for (let i = 0; i + 5 <= lines.length; i += 5) {
      paragraphs++
      const v = detect(model, lines.slice(i, i + 5).join(' '))
      named5 += (lang === 'en' ? !v || v.margin < model.margin : v?.lang === lang && v.margin >= model.margin) ? 1 : 0
    }
    const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1).padStart(6) : '     –')
    console.log(`${key.padEnd(14)} ${String(lines.length).padStart(5)}  ${pct(binary, lines.length)}           ${lang === 'en' ? '     –' : pct(named, lines.length)}       ${lang === 'en' ? '     –' : pct(caught, lines.length)}             ${pct(named5, paragraphs)} (${paragraphs})`)
  }
}

/** The margin that lets at most ENGLISH_WRONG of English DEV sentences pass as typed. */
function chooseMargin(model: Model, english: string[]): number {
  const margins = english.map((s) => detect(model, s)?.margin ?? -Infinity).sort((a, b) => a - b)
  return Math.max(0, margins[Math.min(margins.length - 1, Math.floor(margins.length * (1 - ENGLISH_WRONG)))])
}

/** DEV accuracy at naming the language of human typing (Dakshina) in paragraphs of
 *  five sentences, about what a paste holds: the figure the size is chosen on. */
function humanNamed(model: Model, d: Record<string, Record<Split, string[]>>): number {
  let ok = 0, n = 0
  for (const [key, splits] of Object.entries(d)) {
    if (!key.startsWith('dakshina')) continue
    const lines = splits.dev
    for (let i = 0; i + 5 <= lines.length; i += 5) (n++, (ok += detect(model, lines.slice(i, i + 5).join(' '))?.lang === langOf(key) ? 1 : 0))
  }
  return (100 * ok) / n
}

if (import.meta.main) {
  const d = await data()
  if (process.argv[2] === 'test') {
    const read = existsSync(READS) && readFileSync(READS, 'utf8').split('\n').some((l) => l.split('\t')[1] === 'detect-typed-test')
    const again = process.argv.indexOf('--again')
    if (read && again < 0) throw new Error(`TEST was read before (${READS}); pass --again "<reason>" to read it again`)
    appendFileSync(READS, [new Date().toISOString(), 'detect-typed-test', `model ${JSON.parse(readFileSync(OUT, 'utf8')).version}`, again < 0 ? 'first read' : process.argv[again + 1] ?? 'no reason given'].join('\t') + '\n')
    measure(JSON.parse(readFileSync(OUT, 'utf8')), d, 'test')
  } else {
    const models = SIZES.map((k) => {
      const m = train(d, k)
      m.margin = chooseMargin(m, d['in22 en'].dev)
      return { k, m, human: humanNamed(m, d), bytes: JSON.stringify(m).length }
    })
    console.log('size   DEV language% on human typing, paragraphs of 5   bytes')
    for (const { k, human, bytes } of models) console.log(`${String(k).padStart(4)}   ${human.toFixed(1).padStart(10)}                   ${bytes}`)
    // The smallest model within 1 point of the best.
    const best = Math.max(...models.map((x) => x.human))
    const chosen = models.find((x) => x.human >= best - 1)!
    console.log(`chosen: top ${chosen.k}`)
    measure(chosen.m, d, 'dev')
    writeFileSync(OUT, JSON.stringify(chosen.m))
    console.log(`\nwrote ${OUT}, ${chosen.bytes} bytes`)
  }
}
