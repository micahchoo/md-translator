// Latin letters under a translation (भारत → bharat), for a reader who speaks
// the language but does not read its script. indickit's romanizer and one
// language's tables (0.2–1.8 MB) load only when the owner asks for them,
// through src/lazy.ts, which keeps one language's at a time: parsed, Hindi's
// take ~70 MB of heap.
import type { Romanizer } from 'indickit/romanize'
import { LANGUAGES } from './languages'

/** Every target language has tables (test/latin.test.ts); English needs none. */
export const hasLatin = (lang: string) => lang !== 'en' && lang in LANGUAGES

/** The romanizer for running text in one language. The npm package carries no
 *  tables: they are read from jsDelivr, at its version. */
export const romanizer = (lang: string): Promise<Romanizer> => import('indickit/romanize').then((m) => m.load(lang, 'words', { base: m.CDN }))

/** A Latin line ends sentences with a full stop, not a danda (।, ॥) or the Urdu full stop (۔). */
export const latinText = (r: Pick<Romanizer, 'text'>, text: string) => r.text(text).replace(/[।॥۔]/g, '.')
