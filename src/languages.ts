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
// Urdu, Bengali, Odia, Gujarati, Maithili and Punjabi failed for want of
// examples: short blocks came back copied, romanised or in a related language.
// Every language but Hindi and Kannada now has examples written by Claude and
// checked against Google Translate both ways (bench/examples.ts). With them all
// passed the screen and the short-block test with 0 of 30 short blocks in the
// wrong language; for the six that passed without them, the examples still
// raised chrF against Google Translate by 7 to 10 points. Sanskrit, Konkani and
// Dogri failed the first screen outright (Dogri wrote Punjabi in Gurmukhi) and
// passed with examples; Sanskrit by the narrowest margin of any. Bodo, Sindhi
// and Kashmiri, which Claude cannot write, take five of IN22's own human rows
// (bench/examples.ts#fromIN22) and passed with them; Manipuri and Santali, given
// the same, wrote the right language but scored under the floor. The examples cover the shapes the model got wrong without them: a
// bare heading, a question it must not answer, a bold list label, inline code
// with a link, and a sentence of acronyms and dates. None is about any one
// subject, so they bias no document toward a genre.

export type Pair = [english: string, translation: string]

/** A text is read aloud in two steps: espeak-ng's rules for a language turn it
 *  into IPA, and a Piper voice speaks that IPA. Where no Piper voice fits,
 *  espeak-ng speaks it itself, mechanically.
 *
 *  Measured 2026-10-04 on each first example's IPA: espeak-ng read Assamese as
 *  letter names and Konkani as garbage, and its Sindhi reads Arabic script, not
 *  our Devanagari. It has no rules at all for Bodo, Dogri, Kashmiri, Maithili or
 *  Sanskrit. The Devanagari languages among these take Hindi's rules and voice,
 *  which the owner heard and accepted, and say so (`accent`). */
export interface Voice {
  /** espeak-ng's rules for the language: they make the IPA. */
  espeak: string
  /** A voice in rhasspy/piper-voices, by its name; see PIPER_VOICES in src/speech.ts. */
  piper?: string
  /** The language whose pronunciation is borrowed, when it is not this one's. */
  accent?: string
}

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
  /** How it is read aloud (src/speech.ts). Absent where nothing reads it well. */
  voice?: Voice
  /** How an attached image in this language is read (src/ocr.ts). Absent
   *  where bench/ocr.ts measured a score wholly below its floor: Malayalam,
   *  Odia, Sanskrit, Tamil and Telugu on real pages, Urdu and Kashmiri
   *  everywhere. Hindi's, Assamese's, Bengali's, Gujarati's and Nepali's page
   *  scores straddle the floor, and the owner chose to offer them; Nepali's
   *  pages are Hindi ones, since it has no Wikisource. */
  ocr?: Ocr
  examples: Pair[]
}

/** A Tesseract model in tessdata_fast, and the language whose model it is when
 *  that is not this one: Bodo, Dogri, Maithili and Sindhi are read with
 *  Hindi's, Konkani with Marathi's. Sindhi's own letters ॻ ॼ ॾ ॿ come back
 *  as their nearest Hindi ones. */
export interface Ocr {
  model: string
  borrowed?: string
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
  en: { code: 'en', name: 'English', native: 'English', from: ANY_SOURCE, script: /[A-Za-z]/g, length: 1, voice: { espeak: 'en', piper: 'en_US-ljspeech-medium' }, ocr: { model: 'eng' }, examples: [] },
  as: {
    code: 'as',
    name: 'Assamese',
    native: 'অসমীয়া',
    from: 'English',
    script: /[ঀ-৿]/g,
    length: 1.00,
    ocr: { model: 'asm' },
    examples: zip([
      'ই কেনেকৈ কাম কৰে',
      'ই অফলাইনত কাম কৰেনে?',
      '**বেকআপ**: প্ৰতিটো টোকাৰ এটা প্ৰতিলিপি, যি প্ৰতি নিশা সংৰক্ষণ কৰা হয়',
      '`npm install` চলাওক, তাৰ পিছত [ছেটআপ নিৰ্দেশিকা](#1) পঢ়ক। ইয়াত প্ৰায় 5 মিনিট লাগে।',
      'FDAৰ 2026 চনৰ প্ৰতিবেদন আগষ্ট 2026 লৈকে **এতিয়াও খচৰা**। [নিৰ্দেশনা](#1)',
    ]),
  },
  bn: {
    code: 'bn',
    name: 'Bengali',
    native: 'বাংলা',
    from: 'English',
    script: /[ঀ-৿]/g,
    length: 0.95,
    foreign: /[ৰৱ]/,
    voice: { espeak: 'bn', piper: 'bn_BD-google-medium' },
    ocr: { model: 'ben' },
    examples: zip([
      'এটি কীভাবে কাজ করে',
      'এটি কি অফলাইনে কাজ করে?',
      '**ব্যাকআপ**: প্রতিটি নোটের একটি কপি, যা প্রতি রাতে সংরক্ষণ করা হয়',
      '`npm install` চালান, তারপর [সেটআপ নির্দেশিকা](#1) পড়ুন। এতে প্রায় 5 মিনিট সময় লাগে।',
      'FDA-র 2026 সালের প্রতিবেদনটি আগস্ট 2026 পর্যন্ত **এখনও খসড়া**। [নির্দেশিকা](#1)',
    ]),
  },
  brx: {
    code: 'brx',
    name: 'Bodo',
    native: 'बर’',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 1.02,
    foreign: /[ॻॼॾॿ]/,
    // IN22-Gen (AI4Bharat, CC BY 4.0), rows 268, 277, 76, 45, 221: human translations.
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium', accent: 'Hindi' },
    ocr: { model: 'hin', borrowed: 'Hindi' },
    examples: [
      ['There is a medico-legal aspect.', 'बेवहाय मोनसे मुलियारि-आयेनारि बिथिं दं।'],
      ['What is the harm?', 'बेयाव मा खहा दं?'],
      ['**Despite this unsettling global environment, the Indian economy continues to be resilient.**', '**मुलुगारि दिदोमथि गैयि थासारिआवबो भारतनि रांखान्थिआ गोख्रोङै थाबाय थादों।**'],
      ['[It intervenes in the market to curb excessive volatility and anchor expectations.](#1) `npm install`', '[बेयो बांद्राय गोजोरथि गैयिखौ होबथानो हाथाइ गेजेराव हाबो आरो मिजिं थिनायखौ थुलुंगा होयो।](#1) `npm install`'],
      ['The live telecast of proceedings started in 1994.', 'थोंजोङै फोसावनाया 1994 आव जागायदोंमोन।'],
    ],
  },
  doi: {
    code: 'doi',
    name: 'Dogri',
    native: 'डोगरी',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 0.99,
    foreign: /[ॻॼॾॿ]/,
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium', accent: 'Hindi' },
    ocr: { model: 'hin', borrowed: 'Hindi' },
    examples: zip([
      'एह् किस चाल्ली कम्म करदा ऐ',
      'केह् एह् ऑफलाइन कम्म करदा ऐ?',
      '**बैकअप**: हर नोट दी इक कापी, जेह्ड़ी हर रातीं संभाली जंदी ऐ',
      '`npm install` चलाओ, फ्ही [सेटअप गाइड](#1) पढ़ो। इस च लगभग 5 मिनट लगदे न।',
      'FDA दी 2026 दी रिपोर्ट अगस्त 2026 तगर **अजें बी मसौदा** ऐ। [मार्गदर्शन](#1)',
    ]),
  },
  gu: {
    code: 'gu',
    name: 'Gujarati',
    native: 'ગુજરાતી',
    from: 'English',
    script: /[઀-૿]/g,
    length: 0.93,
    voice: { espeak: 'gu' },
    ocr: { model: 'guj' },
    examples: zip([
      'તે કેવી રીતે કામ કરે છે',
      'શું તે ઑફલાઇન કામ કરે છે?',
      '**બેકઅપ**: દરેક નોંધની એક નકલ, જે દર રાત્રે સાચવવામાં આવે છે',
      '`npm install` ચલાવો, પછી [સેટઅપ માર્ગદર્શિકા](#1) વાંચો. તેમાં લગભગ 5 મિનિટ લાગે છે.',
      'FDAનો 2026નો અહેવાલ ઑગસ્ટ 2026 સુધી **હજુ પણ મુસદ્દો** છે. [માર્ગદર્શન](#1)',
    ]),
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    foreign: /[ॻॼॾॿ]/,
    native: 'हिन्दी',
    length: 0.99,
    from: 'English',
    script: /[ऀ-ॿ]/g,
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium' },
    ocr: { model: 'hin' },
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
    voice: { espeak: 'kn' },
    ocr: { model: 'kan' },
    examples: zip([
      'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
      'ಇದು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆಯೇ?',
      '**ಬ್ಯಾಕಪ್‌ಗಳು**: ಪ್ರತಿ ಟಿಪ್ಪಣಿಯ ಒಂದು ಪ್ರತಿ, ಪ್ರತಿ ರಾತ್ರಿ ಉಳಿಸಲಾಗುತ್ತದೆ',
      '`npm install` ಅನ್ನು ಚಲಾಯಿಸಿ, ನಂತರ [ಸೆಟಪ್ ಮಾರ್ಗದರ್ಶಿ](#1) ಓದಿ. ಇದಕ್ಕೆ ಸುಮಾರು 5 ನಿಮಿಷಗಳು ಬೇಕಾಗುತ್ತವೆ.',
      'FDA ಯ 2026 ರ ವರದಿಯು ಆಗಸ್ಟ್ 2026 ರ ವೇಳೆಗೆ **ಇನ್ನೂ ಕರಡು** ಆಗಿದೆ. [ಮಾರ್ಗಸೂಚಿ](#1)',
    ]),
  },
  ks: {
    code: 'ks',
    name: 'Kashmiri',
    native: 'کٲشُر',
    from: 'English',
    script: /[؀-ۿ]/g,
    length: 1.02,
    dir: 'rtl',
    // IN22-Gen (AI4Bharat, CC BY 4.0), rows 268, 277, 76, 45, 221: human translations.
    examples: [
      ['There is a medico-legal aspect.', 'اتین چھُ اکھ طبی-قوٗنونی پہلو۔'],
      ['What is the harm?', 'کیٛا نۄقصان چھُ؟'],
      ['**Despite this unsettling global environment, the Indian economy continues to be resilient.**', '**امہِ پریشان کُن عالمی ماحول باووٚجوٗد چھِ ہندوستانٕچ معاشِیَت لگاتار بڈنٕچہِ قووت تھوان ۔۔**'],
      ['[It intervenes in the market to curb excessive volatility and anchor expectations.](#1) `npm install`', '[یہِ چھُ ضرورَت کھۄتہٕ زیٛادٕ اتار چَڑھاو تہٕ احتِماد حٲصِل کَرنٕچ اُوومیٖد رُکاونہٕ خٲطرٕ بازارَس مَنٛز دَخٕل دِوان۔](#1) `npm install`'],
      ['The live telecast of proceedings started in 1994.', 'کاروٲیی ہُنٛد سیٚدِ سیوٚد ٹیٚلی کاسٹ گوٚو 1994 منٛز شروٗع۔'],
    ],
  },
  gom: {
    code: 'gom',
    name: 'Konkani',
    native: 'कोंकणी',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 0.95,
    foreign: /[ॻॼॾॿ]/,
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium', accent: 'Hindi' },
    ocr: { model: 'mar', borrowed: 'Marathi' },
    examples: zip([
      'हें कशें काम करता',
      'हें ऑफलायन काम करता काय?',
      '**बॅकअप**: दर एका नोटाची एक प्रत, जी दर रातीं सांबाळून दवरतात',
      '`npm install` चलयात, मागीर [सेटअप मार्गदर्शक](#1) वाचात. ताका सुमार 5 मिनटां लागतात.',
      'FDA चो 2026 चो अहवाल ऑगस्ट 2026 मेरेन **अजून मसुदो** आसा. [मार्गदर्शन](#1)',
    ]),
  },
  mai: {
    code: 'mai',
    name: 'Maithili',
    native: 'मैथिली',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 0.92,
    foreign: /[ॻॼॾॿ]/,
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium', accent: 'Hindi' },
    ocr: { model: 'hin', borrowed: 'Hindi' },
    examples: zip([
      'ई कोना काज करैत अछि',
      'की ई ऑफलाइन काज करैत अछि?',
      '**बैकअप**: प्रत्येक नोटक एकटा प्रति, जे सभ राति सहेजल जाइत अछि',
      '`npm install` चलाउ, तखन [सेटअप गाइड](#1) पढ़ू। एहिमे लगभग 5 मिनट लगैत अछि।',
      'FDAक 2026क रिपोर्ट अगस्त 2026 धरि **एखनो मसौदा** अछि। [दिशानिर्देश](#1)',
    ]),
  },
  ml: {
    code: 'ml',
    name: 'Malayalam',
    native: 'മലയാളം',
    from: 'English',
    script: /[ഀ-ൿ]/g,
    length: 1.15,
    voice: { espeak: 'ml', piper: 'ml_IN-arjun-medium' },
    examples: zip([
      'ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു',
      'ഇത് ഓഫ്‌ലൈനിൽ പ്രവർത്തിക്കുമോ?',
      '**ബാക്കപ്പുകൾ**: ഓരോ കുറിപ്പിന്റെയും ഒരു പകർപ്പ്, എല്ലാ രാത്രിയും സംരക്ഷിക്കുന്നു',
      '`npm install` പ്രവർത്തിപ്പിക്കുക, തുടർന്ന് [സജ്ജീകരണ ഗൈഡ്](#1) വായിക്കുക. ഇതിന് ഏകദേശം 5 മിനിറ്റ് എടുക്കും.',
      'FDA-യുടെ 2026-ലെ റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് വരെ **ഇപ്പോഴും കരട്** ആണ്. [മാർഗ്ഗനിർദ്ദേശം](#1)',
    ]),
  },
  mr: {
    code: 'mr',
    name: 'Marathi',
    native: 'मराठी',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 1.01,
    foreign: /[ॻॼॾॿ]/,
    voice: { espeak: 'mr', piper: 'mr_IN-google-medium' },
    ocr: { model: 'mar' },
    examples: zip([
      'हे कसे कार्य करते',
      'हे ऑफलाइन कार्य करते का?',
      '**बॅकअप**: प्रत्येक नोंदीची एक प्रत, जी दररोज रात्री जतन केली जाते',
      '`npm install` चालवा, नंतर [सेटअप मार्गदर्शक](#1) वाचा. याला सुमारे 5 मिनिटे लागतात.',
      'FDA चा 2026 चा अहवाल ऑगस्ट 2026 पर्यंत **अजूनही मसुदा** आहे. [मार्गदर्शन](#1)',
    ]),
  },
  ne: {
    code: 'ne',
    name: 'Nepali',
    native: 'नेपाली',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 0.96,
    foreign: /[ॻॼॾॿ]/,
    voice: { espeak: 'ne', piper: 'ne_NP-chitwan-medium' },
    ocr: { model: 'nep' },
    examples: zip([
      'यो कसरी काम गर्छ',
      'के यो अफलाइन काम गर्छ?',
      '**ब्याकअप**: हरेक नोटको एउटा प्रतिलिपि, जुन हरेक रात सुरक्षित गरिन्छ',
      '`npm install` चलाउनुहोस्, त्यसपछि [सेटअप गाइड](#1) पढ्नुहोस्। यसमा करिब 5 मिनेट लाग्छ।',
      'FDA को 2026 को प्रतिवेदन अगस्ट 2026 सम्म **अझै मस्यौदा** हो। [मार्गदर्शन](#1)',
    ]),
  },
  or: {
    code: 'or',
    name: 'Odia',
    native: 'ଓଡ଼ିଆ',
    from: 'English',
    script: /[଀-୿]/g,
    length: 1.09,
    voice: { espeak: 'or' },
    examples: zip([
      'ଏହା କିପରି କାମ କରେ',
      'ଏହା ଅଫଲାଇନରେ କାମ କରେ କି?',
      '**ବ୍ୟାକଅପ୍**: ପ୍ରତ୍ୟେକ ନୋଟ୍‌ର ଏକ କପି, ଯାହା ପ୍ରତି ରାତିରେ ସଞ୍ଚୟ କରାଯାଏ',
      '`npm install` ଚଲାନ୍ତୁ, ତାପରେ [ସେଟଅପ୍ ଗାଇଡ୍](#1) ପଢ଼ନ୍ତୁ। ଏଥିରେ ପ୍ରାୟ 5 ମିନିଟ୍ ଲାଗେ।',
      'FDAର 2026 ରିପୋର୍ଟ ଅଗଷ୍ଟ 2026 ସୁଦ୍ଧା **ଏବେ ବି ଏକ ଡ୍ରାଫ୍ଟ**। [ମାର୍ଗଦର୍ଶିକା](#1)',
    ]),
  },
  pa: {
    code: 'pa',
    name: 'Punjabi',
    native: 'ਪੰਜਾਬੀ',
    from: 'English',
    script: /[਀-੿]/g,
    length: 0.92,
    voice: { espeak: 'pa' },
    ocr: { model: 'pan' },
    examples: zip([
      'ਇਹ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ',
      'ਕੀ ਇਹ ਔਫਲਾਈਨ ਕੰਮ ਕਰਦਾ ਹੈ?',
      '**ਬੈਕਅੱਪ**: ਹਰ ਨੋਟ ਦੀ ਇੱਕ ਕਾਪੀ, ਜੋ ਹਰ ਰਾਤ ਸੰਭਾਲੀ ਜਾਂਦੀ ਹੈ',
      '`npm install` ਚਲਾਓ, ਫਿਰ [ਸੈੱਟਅੱਪ ਗਾਈਡ](#1) ਪੜ੍ਹੋ। ਇਸ ਵਿੱਚ ਲਗਭਗ 5 ਮਿੰਟ ਲੱਗਦੇ ਹਨ।',
      'FDA ਦੀ 2026 ਦੀ ਰਿਪੋਰਟ ਅਗਸਤ 2026 ਤੱਕ **ਅਜੇ ਵੀ ਇੱਕ ਖਰੜਾ** ਹੈ। [ਮਾਰਗਦਰਸ਼ਨ](#1)',
    ]),
  },
  sa: {
    code: 'sa',
    name: 'Sanskrit',
    native: 'संस्कृतम्',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 0.98,
    foreign: /[ॻॼॾॿ]/,
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium', accent: 'Hindi' },
    examples: zip([
      'एतत् कथं कार्यं करोति',
      'किम् एतत् अन्तर्जालं विना कार्यं करोति?',
      '**प्रतिलिपयः**: प्रत्येकस्याः टिप्पण्याः एका प्रतिलिपिः, या प्रतिरात्रं रक्ष्यते',
      '`npm install` चालयतु, ततः [सज्जीकरण-मार्गदर्शिकाम्](#1) पठतु। अस्मिन् प्रायः 5 निमेषाः भवन्ति।',
      'FDA-संस्थायाः 2026 वर्षस्य प्रतिवेदनम् अगस्त 2026 पर्यन्तं **अद्यापि प्रारूपम्** अस्ति। [मार्गदर्शनम्](#1)',
    ]),
  },
  sd: {
    code: 'sd',
    name: 'Sindhi',
    native: 'सिन्धी',
    from: 'English',
    script: /[ऀ-ॿ]/g,
    length: 1.0,
    // IN22-Gen (AI4Bharat, CC BY 4.0), rows 268, 277, 76, 45, 221: human translations.
    voice: { espeak: 'hi', piper: 'hi_IN-rohan-medium', accent: 'Hindi' },
    ocr: { model: 'hin', borrowed: 'Hindi' },
    examples: [
      ['There is a medico-legal aspect.', 'हिकि तबई-कानूनी पहलू आहे।'],
      ['What is the harm?', 'कहिड़ो नुकसानि आहे?'],
      ['**Despite this unsettling global environment, the Indian economy continues to be resilient.**', '**हिन परेशान कंदड आलमी वातावरण हूंदे बि, हिंदुस्तानी महीशत लगा॒तार लिचकेदार थी रही आहे।**'],
      ['[It intervenes in the market to curb excessive volatility and anchor expectations.](#1) `npm install`', '[तमाम घणी वधि-घटि ऐं ज़ामिननि जी उम्मेदुनु खे रोकण जे लाए इहा बाज़ार जे विच में पवे थी।](#1) `npm install`'],
      ['The live telecast of proceedings started in 1994.', 'कार्रवाईअ जो लाइव टेलीकास्ट 1994 में शुरू थियो।'],
    ],
  },
  ta: {
    code: 'ta',
    name: 'Tamil',
    native: 'தமிழ்',
    from: 'English',
    script: /[஀-௿]/g,
    length: 1.17,
    voice: { espeak: 'ta' },
    examples: zip([
      'இது எப்படி வேலை செய்கிறது',
      'இது ஆஃப்லைனில் வேலை செய்யுமா?',
      '**காப்புப்பிரதிகள்**: ஒவ்வொரு குறிப்பின் ஒரு நகல், ஒவ்வொரு இரவும் சேமிக்கப்படுகிறது',
      '`npm install` ஐ இயக்கவும், பிறகு [அமைவு வழிகாட்டியை](#1) படிக்கவும். இதற்கு சுமார் 5 நிமிடங்கள் ஆகும்.',
      'FDA-வின் 2026 அறிக்கை ஆகஸ்ட் 2026 நிலவரப்படி **இன்னும் வரைவாகவே** உள்ளது. [வழிகாட்டுதல்](#1)',
    ]),
  },
  te: {
    code: 'te',
    name: 'Telugu',
    native: 'తెలుగు',
    from: 'English',
    script: /[ఀ-౿]/g,
    length: 1.00,
    voice: { espeak: 'te', piper: 'te_IN-padmavathi-medium' },
    examples: zip([
      'ఇది ఎలా పనిచేస్తుంది',
      'ఇది ఆఫ్‌లైన్‌లో పనిచేస్తుందా?',
      '**బ్యాకప్‌లు**: ప్రతి నోట్ యొక్క ఒక కాపీ, ప్రతి రాత్రి సేవ్ చేయబడుతుంది',
      '`npm install` రన్ చేయండి, తర్వాత [సెటప్ గైడ్](#1) చదవండి. దీనికి సుమారు 5 నిమిషాలు పడుతుంది.',
      'FDA యొక్క 2026 నివేదిక ఆగస్టు 2026 నాటికి **ఇంకా ముసాయిదా**గానే ఉంది. [మార్గదర్శకత్వం](#1)',
    ]),
  },
  ur: {
    code: 'ur',
    name: 'Urdu',
    native: 'اردو',
    from: 'English',
    script: /[؀-ۿ]/g,
    length: 0.97,
    dir: 'rtl',
    voice: { espeak: 'ur', piper: 'ur_PK-fasih-medium' },
    examples: zip([
      'یہ کیسے کام کرتا ہے',
      'کیا یہ آف لائن کام کرتا ہے؟',
      '**بیک اپ**: ہر نوٹ کی ایک کاپی، جو ہر رات محفوظ کی جاتی ہے',
      '`npm install` چلائیں، پھر [سیٹ اپ گائیڈ](#1) پڑھیں۔ اس میں تقریباً 5 منٹ لگتے ہیں۔',
      'FDA کی 2026 کی رپورٹ اگست 2026 تک **ابھی بھی مسودہ** ہے۔ [رہنمائی](#1)',
    ]),
  },
}

/** The direction of text in the language with this code; `auto` when unknown. */
export const dirOf = (code: string | undefined) => (code ? (LANGUAGES[code]?.dir ?? 'ltr') : 'auto')

/** What the picker shows: the direction, so a future pair (Hindi → Tamil) needs no new control. */
export const directionLabel = ({ from, name }: Language) => `${from === ANY_SOURCE ? 'Any language' : from} → ${name}`
