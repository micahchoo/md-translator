// Checks the worked examples Claude wrote for every language but Hindi and
// Kannada (now in src/languages.ts) against Google Translate, both
// ways: its own translation of each English line, and Claude's line translated
// back into English. Every line passed on 2026-10-04: meaning, numbers, code and
// link targets intact. The text that ships is Claude's, never Google's.
//
//   bun bench/examples.ts [staged]   prints the two checks for every line
import { LANGUAGES, type Pair } from '../src/languages'
import { gt, translateAll } from './gt'

export const WRITTEN_BY_CLAUDE = ['as', 'bn', 'gu', 'mai', 'ml', 'mr', 'ne', 'or', 'pa', 'ta', 'te', 'ur']

const EN = LANGUAGES.hi.examples.map(([en]) => en)
const zip = (to: string[]): Pair[] => EN.map((en, i) => [en, to[i]])

/** Examples for languages that already pass without them, held here until an A/B
 *  on bench/starts.ts (`staged` arm) shows they help. */
export const STAGED: Record<string, Pair[]> = {
  sa: zip([
    'एतत् कथं कार्यं करोति',
    'किम् एतत् अन्तर्जालं विना कार्यं करोति?',
    '**प्रतिलिपयः**: प्रत्येकस्याः टिप्पण्याः एका प्रतिलिपिः, या प्रतिरात्रं रक्ष्यते',
    '`npm install` चालयतु, ततः [सज्जीकरण-मार्गदर्शिकाम्](#1) पठतु। अस्मिन् प्रायः 5 निमेषाः भवन्ति।',
    'FDA-संस्थायाः 2026 वर्षस्य प्रतिवेदनम् अगस्त 2026 पर्यन्तं **अद्यापि प्रारूपम्** अस्ति। [मार्गदर्शनम्](#1)',
  ]),
  gom: zip([
    'हें कशें काम करता',
    'हें ऑफलायन काम करता काय?',
    '**बॅकअप**: दर एका नोटाची एक प्रत, जी दर रातीं सांबाळून दवरतात',
    '`npm install` चलयात, मागीर [सेटअप मार्गदर्शक](#1) वाचात. ताका सुमार 5 मिनटां लागतात.',
    'FDA चो 2026 चो अहवाल ऑगस्ट 2026 मेरेन **अजून मसुदो** आसा. [मार्गदर्शन](#1)',
  ]),
  doi: zip([
    'एह् किस चाल्ली कम्म करदा ऐ',
    'केह् एह् ऑफलाइन कम्म करदा ऐ?',
    '**बैकअप**: हर नोट दी इक कापी, जेह्ड़ी हर रातीं संभाली जंदी ऐ',
    '`npm install` चलाओ, फ्ही [सेटअप गाइड](#1) पढ़ो। इस च लगभग 5 मिनट लगदे न।',
    'FDA दी 2026 दी रिपोर्ट अगस्त 2026 तगर **अजें बी मसौदा** ऐ। [मार्गदर्शन](#1)',
  ]),
}
const examplesOf = (code: string) => STAGED[code] ?? LANGUAGES[code].examples

if (import.meta.main) {
  const codes = process.argv[2] === 'staged' ? Object.keys(STAGED) : WRITTEN_BY_CLAUDE
  const jobs = codes.flatMap((code) =>
    examplesOf(code).flatMap(([en, t]) => [{ from: 'en', to: code, text: en }, { from: code, to: 'en', text: t }]),
  )
  await translateAll(jobs, 20_000)
  for (const code of codes) {
    console.log(`== ${code}`)
    for (const [en, t] of examplesOf(code)) console.log(`  mine: ${t}\n  GT:   ${gt('en', code, en)}\n  back: ${gt(code, 'en', t)}\n`)
  }
}
