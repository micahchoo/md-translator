// Checks a translated unit against its source without asking any model. Each
// flag names one failure seen in the trials on sarvam-30b; a flagged unit is
// retried, and still flagged it is shown to the reader.
import type { Language } from './languages'

export type Flag = 'empty' | 'untranslated' | 'partial' | 'markup' | 'numbers' | 'short' | 'long' | 'truncated'

const LATIN = /[A-Za-z]/g
const LOWER_WORD = /\b[a-z][a-z'-]{2,}\b/g
const ENGLISH_RUN = /(?:\b[a-z][a-z'-]*\b[\s,;:()/-]+){4}\b[a-z][a-z'-]*\b/

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

const numbers = (s: string) => (prose(s).match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join(' ')

export function check(source: string, output: string, lang: Language): Flag[] {
  if (!output.trim()) return ['empty']
  const src = prose(source)
  const out = prose(output)
  const target = count(out, lang.script)
  const latin = count(out, LATIN)
  const share = target / Math.max(1, target + latin)
  const ratio = out.length / Math.max(1, src.length)
  const flags: Flag[] = []
  if (share < 0.3 && count(src, LOWER_WORD) >= 2) flags.push('untranslated')
  if (target > 0 && ENGLISH_RUN.test(out.replace(/\[[^\]]*\]/g, ''))) flags.push('partial')
  if (markup(source) !== markup(output)) flags.push('markup')
  if (numbers(source) !== numbers(output)) flags.push('numbers')
  if (src.length >= 40 && ratio < 0.7) flags.push('short')
  if (src.length >= 15 && ratio > 1.8) flags.push('long')
  if (/(?:\.\.\.|…)\s*$/.test(output) && !/(?:\.\.\.|…)\s*$/.test(source)) flags.push('truncated')
  return flags
}
