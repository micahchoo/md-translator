// A target language is its name, the script its letters come from, and five
// examples. The examples cover the shapes the model got wrong without them: a
// bare heading, a question it must not answer, a bold list label, inline code
// with a link, and a sentence of acronyms and dates. None is about any one
// subject, so they bias no document toward a genre.

export type Pair = [english: string, translation: string]

export interface Language {
  code: string
  name: string
  /** Letters of the target script; used to tell a translation from an echo. */
  script: RegExp
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
  hi: {
    code: 'hi',
    name: 'Hindi',
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
    script: /[ಀ-೿]/g,
    examples: zip([
      'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
      'ಇದು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆಯೇ?',
      '**ಬ್ಯಾಕಪ್‌ಗಳು**: ಪ್ರತಿ ಟಿಪ್ಪಣಿಯ ಒಂದು ಪ್ರತಿ, ಪ್ರತಿ ರಾತ್ರಿ ಉಳಿಸಲಾಗುತ್ತದೆ',
      '`npm install` ಅನ್ನು ಚಲಾಯಿಸಿ, ನಂತರ [ಸೆಟಪ್ ಮಾರ್ಗದರ್ಶಿ](#1) ಓದಿ. ಇದಕ್ಕೆ ಸುಮಾರು 5 ನಿಮಿಷಗಳು ಬೇಕಾಗುತ್ತವೆ.',
      'FDA ಯ 2026 ರ ವರದಿಯು ಆಗಸ್ಟ್ 2026 ರ ವೇಳೆಗೆ **ಇನ್ನೂ ಕರಡು** ಆಗಿದೆ. [ಮಾರ್ಗಸೂಚಿ](#1)',
    ]),
  },
}
