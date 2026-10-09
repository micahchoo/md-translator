// A source typed in Latin letters ("kal meeting hai") written in its language's
// script before the model sees it: sarvam-30b gives typed text back unchanged
// about half the time, and reads it well once written (bench/README, "Text
// typed in Latin letters"). indickit's deromanizer and one language's tables
// (0.3–3.1 MB) load only when the owner asks for them.
import type { Deromanizer } from 'indickit/deromanize'
import { LANGUAGES } from './languages'

/** Every target language but Sindhi has tables (test/typed.test.ts): the app
 *  writes Sindhi in Devanagari and the tables read Perso-Arabic. */
export const hasTyped = (lang: string) => lang !== 'en' && lang !== 'sd' && lang in LANGUAGES

/** One language at a time: a language's tables take tens of MB of heap parsed. */
let loaded: { lang: string; d: Promise<Deromanizer> } | null = null

/** The deromanizer for running text in one language. Asking for another language
 *  lets the last one go; a failed load is tried again next time. */
export function deromanizer(lang: string): Promise<Deromanizer> {
  if (loaded?.lang !== lang) {
    // The npm package carries no tables: read them from jsDelivr, at its version.
    const d = import('indickit/deromanize').then((m) => m.load(lang, 'words', { base: m.CDN }))
    const mine = { lang, d }
    d.catch(() => {
      if (loaded === mine) loaded = null
    })
    loaded = mine
  }
  return loaded.d
}

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
