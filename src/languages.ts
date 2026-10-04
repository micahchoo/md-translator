// A target language is its name, the script its letters come from, the label
// its source line carries, and its examples. Into an Indian language the source
// is English; into English it is labelled Original and its language is left to
// the model to recognise.
//
// Hindi and Kannada carry five examples. The others were admitted on
// 2026-10-04 by bench/pairs.ts with none: both ways through sarvam-30b, chrF no
// more than 10 below the shipped pair, GlotLID agreeing the output is the
// language asked for, and the Markdown probe intact. Gujarati, Maithili and
// Punjabi failed only the probe — without examples they echo English headings.
// Bengali and Odia passed it too and were withdrawn after bench/starts.ts: on
// short blocks at the start of a document, 7 and 5 of 30 came back in the wrong
// language (Assamese for Bengali; English for Odia), past the 1-in-10 rule.
// Urdu passed the screen and was withdrawn the same day: in the browser, with no
// examples, it copied or romanised short Markdown blocks. `dir` stays for its
// return; it is the only right-to-left language so far. The examples cover the shapes the model got wrong without them: a
// bare heading, a question it must not answer, a bold list label, inline code
// with a link, and a sentence of acronyms and dates. None is about any one
// subject, so they bias no document toward a genre.

export type Pair = [english: string, translation: string]

export interface Language {
  code: string
  name: string
  /** Letters of the target script; used to tell a translation from an echo. */
  script: RegExp
  /** The source line's label in the prompt and in the examples. */
  from: string
  /** The language's name in its own script. An answer that is only this name is
   *  not a translation: Telugu answered "How it works" with తెలుగు. */
  native: string
  /** Characters of this language per character of English: the median over
   *  IN22-Gen's 1,024 human pairs. The length checks are measured against it. */
  length: number
  /** Letters of its own script this language never writes. One in an answer
   *  means a related language came back: Assamese ৰ in Bengali, Sindhi ॾ in
   *  Nepali. Each was checked on IN22's human text before it was trusted. */
  foreign?: RegExp
  /** Written right to left; the page sets `dir` from it. */
  dir?: 'rtl'
  examples: Pair[]
}

const EN = [
  'How it works',
  'Does it work offline?',
  '**Backups**: a copy of every note, saved each night',
  'Run `npm install`, then read the [setup guide](#1). It takes about 5 minutes.',
  "FDA's 2026 report is **still a draft** as of Aug 2026. [Guidance](#1)",
]

const zip = (to: string[]): Pair[] => EN.map((en, i) => [en, to[i]])

/** The source label for a source the model must recognise: it names no language. */
export const ANY_SOURCE = 'Original'

export const LANGUAGES: Record<string, Language> = {
  // Into English first: the other direction from every entry below it.
  en: { code: 'en', name: 'English', native: 'English', from: ANY_SOURCE, script: /[A-Za-z]/g, length: 1, examples: [] },
  as: { code: 'as', name: 'Assamese', native: 'অসমীয়া', from: 'English', script: /[ঀ-৿]/g, length: 1.00, examples: [] },
  hi: {
    code: 'hi',
    name: 'Hindi',
    foreign: /[ॻॼॾॿ]/,
    native: 'हिन्दी',
    length: 0.99,
    from: 'English',
    script: /[ऀ-ॿ]/g,
    examples: zip([
      'यह कैसे काम करता है',
      'क्या यह ऑफ़लाइन काम करता है?',
      '**बैकअप**: हर नोट की एक प्रति, जो हर रात सहेजी जाती है',
      '`npm install` चलाएँ, फिर [सेटअप गाइड](#1) पढ़ें। इसमें लगभग 5 मिनट लगते हैं।',
      'FDA की 2026 की रिपोर्ट अगस्त 2026 तक **अभी भी मसौदा** है। [दिशानिर्देश](#1)',
    ]),
  },
  kn: {
    code: 'kn',
    name: 'Kannada',
    native: 'ಕನ್ನಡ',
    length: 1.07,
    from: 'English',
    script: /[ಀ-೿]/g,
    examples: zip([
      'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
      'ಇದು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆಯೇ?',
      '**ಬ್ಯಾಕಪ್‌ಗಳು**: ಪ್ರತಿ ಟಿಪ್ಪಣಿಯ ಒಂದು ಪ್ರತಿ, ಪ್ರತಿ ರಾತ್ರಿ ಉಳಿಸಲಾಗುತ್ತದೆ',
      '`npm install` ಅನ್ನು ಚಲಾಯಿಸಿ, ನಂತರ [ಸೆಟಪ್ ಮಾರ್ಗದರ್ಶಿ](#1) ಓದಿ. ಇದಕ್ಕೆ ಸುಮಾರು 5 ನಿಮಿಷಗಳು ಬೇಕಾಗುತ್ತವೆ.',
      'FDA ಯ 2026 ರ ವರದಿಯು ಆಗಸ್ಟ್ 2026 ರ ವೇಳೆಗೆ **ಇನ್ನೂ ಕರಡು** ಆಗಿದೆ. [ಮಾರ್ಗಸೂಚಿ](#1)',
    ]),
  },
  ml: { code: 'ml', name: 'Malayalam', native: 'മലയാളം', from: 'English', script: /[ഀ-ൿ]/g, length: 1.15, examples: [] },
  mr: { code: 'mr', name: 'Marathi', native: 'मराठी', from: 'English', script: /[ऀ-ॿ]/g, length: 1.01, foreign: /[ॻॼॾॿ]/, examples: [] },
  ne: { code: 'ne', name: 'Nepali', native: 'नेपाली', from: 'English', script: /[ऀ-ॿ]/g, length: 0.96, foreign: /[ॻॼॾॿ]/, examples: [] },
  ta: { code: 'ta', name: 'Tamil', native: 'தமிழ்', from: 'English', script: /[஀-௿]/g, length: 1.17, examples: [] },
  te: { code: 'te', name: 'Telugu', native: 'తెలుగు', from: 'English', script: /[ఀ-౿]/g, length: 1.00, examples: [] },
}

/** The direction of text in the language with this code; `auto` when unknown. */
export const dirOf = (code: string | undefined) => (code ? (LANGUAGES[code]?.dir ?? 'ltr') : 'auto')

/** What the picker shows: the direction, so a future pair (Hindi → Tamil) needs no new control. */
export const directionLabel = ({ from, name }: Language) => `${from === ANY_SOURCE ? 'Any language' : from} → ${name}`
