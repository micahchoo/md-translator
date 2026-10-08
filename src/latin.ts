// Latin letters under a translation (भारत → bharat), for a reader who speaks
// the language but does not read its script. indickit's romanizer and one
// language's tables (0.2–1.8 MB) load only when the owner asks for them.
import type { Romanizer } from 'indickit/romanize'
import { LANGUAGES } from './languages'

/** Every target language has tables (test/latin.test.ts); English needs none. */
export const hasLatin = (lang: string) => lang !== 'en' && lang in LANGUAGES

/** One language at a time: parsed, a language's tables take ~70 MB of heap (Hindi). */
let loaded: { lang: string; r: Promise<Romanizer> } | null = null

/** The romanizer for running text in one language. Asking for another language
 *  lets the last one go; a failed load is tried again next time. */
export function romanizer(lang: string): Promise<Romanizer> {
  if (loaded?.lang !== lang) {
    // The npm package carries no tables: read them from jsDelivr, at its version.
    const r = import('indickit/romanize').then((m) => m.load(lang, 'words', { base: m.CDN }))
    const mine = { lang, r }
    r.catch(() => {
      if (loaded === mine) loaded = null
    })
    loaded = mine
  }
  return loaded.r
}

/** A Latin line ends sentences with a full stop, not a danda (।, ॥) or the Urdu full stop (۔). */
export const latinText = (r: Pick<Romanizer, 'text'>, text: string) => r.text(text).replace(/[।॥۔]/g, '.')
