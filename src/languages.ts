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
  /** Characters of this language per character of English: the median over
   *  IN22-Gen's 1,024 human pairs. The length checks are measured against it. */
  length: number
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

export const LANGUAGES: Record<string, Language> = {
  as: { code: 'as', name: 'Assamese', from: 'English', script: /[ঀ-৿]/g, length: 1.00, examples: [] },
  bn: { code: 'bn', name: 'Bengali', from: 'English', script: /[ঀ-৿]/g, length: 0.95, examples: [] },
  en: { code: 'en', name: 'English', from: 'Original', script: /[A-Za-z]/g, length: 1, examples: [] },
  hi: {
    code: 'hi',
    name: 'Hindi',
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
  ml: { code: 'ml', name: 'Malayalam', from: 'English', script: /[ഀ-ൿ]/g, length: 1.15, examples: [] },
  mr: { code: 'mr', name: 'Marathi', from: 'English', script: /[ऀ-ॿ]/g, length: 1.01, examples: [] },
  ne: { code: 'ne', name: 'Nepali', from: 'English', script: /[ऀ-ॿ]/g, length: 0.96, examples: [] },
  or: { code: 'or', name: 'Odia', from: 'English', script: /[଀-୿]/g, length: 1.09, examples: [] },
  ta: { code: 'ta', name: 'Tamil', from: 'English', script: /[஀-௿]/g, length: 1.17, examples: [] },
  te: { code: 'te', name: 'Telugu', from: 'English', script: /[ఀ-౿]/g, length: 1.00, examples: [] },
}

/** The direction of text in the language with this code; `auto` when unknown. */
export const dirOf = (code: string | undefined) => (code ? (LANGUAGES[code]?.dir ?? 'ltr') : 'auto')
