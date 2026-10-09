// A source typed in Latin letters ("kal meeting hai") written in its language's
// script before the model sees it: sarvam-30b gives typed text back unchanged
// about half the time, and reads it well once written (bench/README, "Text
// typed in Latin letters"). indickit's deromanizer and one language's tables
// (0.3–3.1 MB) load only when the owner asks for them, through src/lazy.ts,
// which keeps one language's at a time: parsed, they take tens of MB of heap.
import type { Deromanizer } from 'indickit/deromanize'
import { LANGUAGES } from './languages'

/** The languages a source can be typed in: those where the translation of the
 *  written-back text came within 5 chrF of the original's (bench/README, "Text
 *  typed in Latin letters"). Odia, Dogri, Kashmiri, Tamil, Konkani, Gujarati,
 *  Marathi, Bodo and Maithili fell 10 to 29 points short; Sindhi has no tables in
 *  the app's script. Each has deromanize tables (test/typed.test.ts). */
export const TYPED = ['as', 'bn', 'hi', 'kn', 'ml', 'ne', 'pa', 'sa', 'te', 'ur']
export const hasTyped = (lang: string) => TYPED.includes(lang) && lang in LANGUAGES

/** The deromanizer for running text in one language. The npm package carries
 *  no tables: they are read from jsDelivr, at its version. */
export const deromanizer = (lang: string): Promise<Deromanizer> => import('indickit/deromanize').then((m) => m.load(lang, 'words', { base: m.CDN }))

/** What stays as typed: inline code, addresses, and masked link targets (`#1`). */
const KEEP = /`[^`]*`|\bhttps?:\/\/\S+|\bwww\.\S+|\S+@\S+\.\S+|#\d+/g

/** A unit's text (link targets already masked by the segmenter) with each run
 *  of Latin letters in its prose written in the script. Numbers and emphasis
 *  marks are kept by the deromanizer; code and addresses are kept here. */
export function typedText(d: Pick<Deromanizer, 'text'>, text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(KEEP)) {
    out += d.text(text.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + d.text(text.slice(last))
}
