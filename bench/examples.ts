// Worked examples for the languages that failed for want of them, written by
// Claude (the same five English lines Hindi and Kannada have) and checked two
// ways against Google Translate before any is used: its own translation of the
// English, and Claude's line translated back into English. The text that ships
// is Claude's, never Google's.
//
//   bun bench/examples.ts            prints the two checks for every line
import type { Pair } from '../src/languages'
import { gt, translateAll } from './gt'

const EN = [
  'How it works',
  'Does it work offline?',
  '**Backups**: a copy of every note, saved each night',
  'Run `npm install`, then read the [setup guide](#1). It takes about 5 minutes.',
  "FDA's 2026 report is **still a draft** as of Aug 2026. [Guidance](#1)",
]
const zip = (to: string[]): Pair[] => EN.map((en, i) => [en, to[i]])

export const EXAMPLES: Record<string, Pair[]> = {
  ur: zip([
    'یہ کیسے کام کرتا ہے',
    'کیا یہ آف لائن کام کرتا ہے؟',
    '**بیک اپ**: ہر نوٹ کی ایک کاپی، جو ہر رات محفوظ کی جاتی ہے',
    '`npm install` چلائیں، پھر [سیٹ اپ گائیڈ](#1) پڑھیں۔ اس میں تقریباً 5 منٹ لگتے ہیں۔',
    'FDA کی 2026 کی رپورٹ اگست 2026 تک **ابھی بھی مسودہ** ہے۔ [رہنمائی](#1)',
  ]),
  bn: zip([
    'এটি কীভাবে কাজ করে',
    'এটি কি অফলাইনে কাজ করে?',
    '**ব্যাকআপ**: প্রতিটি নোটের একটি কপি, যা প্রতি রাতে সংরক্ষণ করা হয়',
    '`npm install` চালান, তারপর [সেটআপ নির্দেশিকা](#1) পড়ুন। এতে প্রায় 5 মিনিট সময় লাগে।',
    'FDA-র 2026 সালের প্রতিবেদনটি আগস্ট 2026 পর্যন্ত **এখনও খসড়া**। [নির্দেশিকা](#1)',
  ]),
  or: zip([
    'ଏହା କିପରି କାମ କରେ',
    'ଏହା ଅଫଲାଇନରେ କାମ କରେ କି?',
    '**ବ୍ୟାକଅପ୍**: ପ୍ରତ୍ୟେକ ନୋଟ୍‌ର ଏକ କପି, ଯାହା ପ୍ରତି ରାତିରେ ସଞ୍ଚୟ କରାଯାଏ',
    '`npm install` ଚଲାନ୍ତୁ, ତାପରେ [ସେଟଅପ୍ ଗାଇଡ୍](#1) ପଢ଼ନ୍ତୁ। ଏଥିରେ ପ୍ରାୟ 5 ମିନିଟ୍ ଲାଗେ।',
    'FDAର 2026 ରିପୋର୍ଟ ଅଗଷ୍ଟ 2026 ସୁଦ୍ଧା **ଏବେ ବି ଏକ ଡ୍ରାଫ୍ଟ**। [ମାର୍ଗଦର୍ଶିକା](#1)',
  ]),
  gu: zip([
    'તે કેવી રીતે કામ કરે છે',
    'શું તે ઑફલાઇન કામ કરે છે?',
    '**બેકઅપ**: દરેક નોંધની એક નકલ, જે દર રાત્રે સાચવવામાં આવે છે',
    '`npm install` ચલાવો, પછી [સેટઅપ માર્ગદર્શિકા](#1) વાંચો. તેમાં લગભગ 5 મિનિટ લાગે છે.',
    'FDAનો 2026નો અહેવાલ ઑગસ્ટ 2026 સુધી **હજુ પણ મુસદ્દો** છે. [માર્ગદર્શન](#1)',
  ]),
  pa: zip([
    'ਇਹ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ',
    'ਕੀ ਇਹ ਔਫਲਾਈਨ ਕੰਮ ਕਰਦਾ ਹੈ?',
    '**ਬੈਕਅੱਪ**: ਹਰ ਨੋਟ ਦੀ ਇੱਕ ਕਾਪੀ, ਜੋ ਹਰ ਰਾਤ ਸੰਭਾਲੀ ਜਾਂਦੀ ਹੈ',
    '`npm install` ਚਲਾਓ, ਫਿਰ [ਸੈੱਟਅੱਪ ਗਾਈਡ](#1) ਪੜ੍ਹੋ। ਇਸ ਵਿੱਚ ਲਗਭਗ 5 ਮਿੰਟ ਲੱਗਦੇ ਹਨ।',
    'FDA ਦੀ 2026 ਦੀ ਰਿਪੋਰਟ ਅਗਸਤ 2026 ਤੱਕ **ਅਜੇ ਵੀ ਇੱਕ ਖਰੜਾ** ਹੈ। [ਮਾਰਗਦਰਸ਼ਨ](#1)',
  ]),
  mai: zip([
    'ई कोना काज करैत अछि',
    'की ई ऑफलाइन काज करैत अछि?',
    '**बैकअप**: प्रत्येक नोटक एकटा प्रति, जे सभ राति सहेजल जाइत अछि',
    '`npm install` चलाउ, तखन [सेटअप गाइड](#1) पढ़ू। एहिमे लगभग 5 मिनट लगैत अछि।',
    'FDAक 2026क रिपोर्ट अगस्त 2026 धरि **एखनो मसौदा** अछि। [दिशानिर्देश](#1)',
  ]),
}

if (import.meta.main) {
  const jobs = Object.entries(EXAMPLES).flatMap(([code, pairs]) =>
    pairs.flatMap(([en, t]) => [{ from: 'en', to: code, text: en }, { from: code, to: 'en', text: t }]),
  )
  await translateAll(jobs, 20_000)
  for (const [code, pairs] of Object.entries(EXAMPLES)) {
    console.log(`== ${code}`)
    for (const [en, t] of pairs) console.log(`  mine: ${t}\n  GT:   ${gt('en', code, en)}\n  back: ${gt(code, 'en', t)}\n`)
  }
}
