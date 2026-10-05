// Checks a translated unit against its source without asking any model. Each
// flag names one failure seen in the trials on sarvam-30b; a flagged unit is
// retried, and still flagged it is shown to the reader.
import { LANGUAGES, type Language, type Pair } from './languages'

export type Flag = 'empty' | 'untranslated' | 'script' | 'unrelated' | 'meaning' | 'language' | 'partial' | 'markup' | 'numbers' | 'short' | 'long' | 'truncated' | 'form'

// What an answer that never left its source looks like. From English: Latin
// letters, lower-case words (acronyms and names are kept on purpose), and a run
// of them. Into English the source may be any script but Latin, and a run is
// four of its words together.
interface Leftover {
  letters: RegExp
  words: RegExp
  run?: RegExp
}
const FROM_ENGLISH: Leftover = {
  letters: /[A-Za-z]/g,
  words: /\b[a-z][a-z'-]{2,}\b/g,
  run: /(?:\b[a-z][a-z'-]*\b[\s,;:()/-]+){4}\b[a-z][a-z'-]*\b/,
}
const FROM_ANY: Leftover = {
  letters: /(?![A-Za-z])[\p{L}\p{M}]/gu,
  words: /(?:(?![A-Za-z])[\p{L}\p{M}]){2,}/gu,
  run: /(?:(?:(?![A-Za-z])[\p{L}\p{M}])+[\s,;:()/-]+){3}(?:(?![A-Za-z])[\p{L}\p{M}])+/u,
}

const LETTERS = /[\p{L}\p{M}]/gu
/** A capitalised English word, as a one-word heading is: "Installation", not
 *  "GitHub" (a capital inside) or "NASA" (all capitals), which are names. */
const TITLE_WORD = /\b[A-Z][a-z'-]{2,}\b/g

/** Letters only, so "తెలుగు." and "తెలుగు" are one answer. */
const bare = (s: string) => s.replace(/[^\p{L}\p{M}\p{N}]/gu, '')

/** Inline code and masked targets carry no prose; leave them out of every measure. */
const prose = (s: string) => s.replace(/`[^`]*`/g, '').replace(/\]\(#\d+\)/g, ']').replace(/\[\[#\d+\|?/g, '[[')

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0

/** What a translation must carry over unchanged: code, targets and emphasis marks. */
function markup(s: string): string {
  const sorted = (re: RegExp) => (s.match(re) ?? []).sort().join('\u0000')
  return [
    sorted(/`[^`]*`/g),
    sorted(/\]\(#\d+\)/g),
    sorted(/\[\[#\d+/g),
    count(s, /\*\*/g),
    count(s.replace(/\*\*/g, ''), /\*/g),
  ].join('|')
}

/** Every script's digits as 0-9: `೨೦೨೦` and `2020` are one year. Unicode keeps
 *  each script's ten digits consecutive from zero, so a digit's value is its
 *  distance from the first digit of its run. */
function latinDigits(s: string): string {
  return s.replace(/(?![0-9])\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!
    let zero = cp
    while (cp - zero < 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--
    return String(cp - zero)
  })
}

/** Numbers as values: grouping marks dropped (1,000 and 1,00,000 and Urdu's
 *  50٬000), every decimal mark a point (Urdu's 4٫7). */
const numbers = (s: string) =>
  (latinDigits(prose(s)).replace(/(\d)[,٬](?=\d)/g, '$1').replace(/(\d)[٫·](?=\d)/g, '$1.').match(/\d+(?:\.\d+)*/g) ?? [])
    .sort()
    .join(' ')

// A translation's length against its source, as a multiple of what is normal
// for the pair. Chosen on IN22-Gen, 2026-10-04: below 0.7 or above 1.4 flags
// 0.5% and 0.7% of human translations, and catches 97% of answers cut short and
// 90% with a sentence added.
const SHORT = 0.7
const LONG = 1.4
// Under 40 characters a translation varies more than the medians allow, which
// were measured on long sentences. bench/starts.ts, 2026-10-04: of 125 such
// blocks flagged long, the 11 above twice normal held every real addition seen
// (a label line leaked, the English repeated: 3.3x to 40x); the rest were
// complete translations.
const LONG_SHORT_SOURCE = 2

/** Into English the source's language is not named; its script stands in. */
function sourceLength(src: string): number {
  let best = { letters: 0, length: 1 }
  for (const l of Object.values(LANGUAGES)) {
    if (l.code === 'en') continue
    const letters = count(src, l.script)
    if (letters > best.letters) best = { letters, length: l.length }
  }
  return best.length
}

// An answer's form against its source's. A flagged answer is never shown to
// the model as context, so a form that drifted cannot spread: on a brochure
// one answer with a comma after every word was passed on, and every block
// after it came back the same way.
const COMMA = /[,،、]/g
const wordsOf = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))

/** True when the answer's form is not its source's: a comma after most words,
 *  a phrase looped, or an English answer in capitals throughout. */
export function formDrift(source: string, output: string, lang: Language): boolean {
  const ow = wordsOf(output)
  if (ow.length < 4) return false
  const sw = wordsOf(source)
  const rate = (s: string, w: string[]) => count(s, COMMA) / Math.max(1, w.length)
  if (rate(output, ow) >= 0.5 && rate(output, ow) >= 2 * rate(source, sw) + 0.2) return true
  // A loop is the same words back to back, "X X X": a list may name "State
  // Bank of" four times, apart, and the source does too in its own script.
  const w = ow.map((x) => x.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, ''))
  for (let n = 1; n <= 6; n++)
    for (let i = 0; i + 3 * n <= w.length; i++) {
      const g = w.slice(i, i + n).join(' ')
      if (g && w.slice(i + n, i + 2 * n).join(' ') === g && w.slice(i + 2 * n, i + 3 * n).join(' ') === g) return true
    }
  if (lang.code === 'en') {
    const latin = count(output, /[A-Za-z]/g)
    if (latin >= 15 && count(output, /[A-Z]/g) / latin >= 0.8 && !/[A-Z]{2}/.test(source.replace(/[^A-Z]/g, ' ').replace(/\b[A-Z]\b/g, ''))) return true
  }
  return false
}

/**
 * `earlier` is what the document already holds: the examples shown and every
 * block before this one, as source and answer. An answer repeated there for a
 * different source was not made from this block.
 */
export function check(source: string, output: string, lang: Language, earlier: Pair[] = []): Flag[] {
  if (!output.trim()) return ['empty']
  const src = prose(source)
  const out = prose(output)
  const left = lang.from === 'English' ? FROM_ENGLISH : FROM_ANY
  const target = count(out, lang.script)
  // Measured against every letter, not only the source's: an answer in a third
  // script (Assamese asked for Bodo) is not on target either.
  const letters = Math.max(1, count(out, LETTERS))
  const expected = lang.from === 'English' ? lang.length : 1 / sourceLength(src)
  const ratio = out.length / Math.max(1, src.length) / expected
  const flags: Flag[] = []
  const words = count(src, left.words) + (left === FROM_ENGLISH ? count(src, TITLE_WORD) : 0)
  if (count(src, LETTERS) && !count(out, LETTERS)) return ['empty'] // punctuation only, as `"""`
  // An answer identical to a source with even one word to translate is an
  // echo, however short; the share rule once needed two words and missed headings.
  const echo = out.trim() === src.trim() && words >= 1
  if (echo) flags.push('untranslated')
  else if (target / letters < 0.3 && words >= 1)
    flags.push(count(out, left.letters) / letters >= 0.5 ? 'untranslated' : 'script')
  if (lang.foreign?.test(out) && !flags.includes('script')) flags.push('script')
  const name = bare(out) === bare(lang.native) && bare(src) !== bare(lang.name)
  const repeated = earlier.some(([s, t]) => bare(t) === bare(output) && bare(s) !== bare(source))
  if (name || repeated) flags.push('unrelated')
  if (target > 0 && left.run?.test(out.replace(/\[[^\]]*\]/g, ''))) flags.push('partial')
  if (markup(source) !== markup(output)) flags.push('markup')
  if (numbers(source) !== numbers(output)) flags.push('numbers')
  if (src.length >= 40 && ratio < SHORT) flags.push('short')
  if (src.length >= 15 && ratio > (src.length < 40 ? LONG_SHORT_SOURCE : LONG)) flags.push('long')
  if (/(?:\.\.\.|…)\s*$/.test(output) && !/(?:\.\.\.|…)\s*$/.test(source)) flags.push('truncated')
  if (formDrift(source, output, lang)) flags.push('form')
  return flags
}
