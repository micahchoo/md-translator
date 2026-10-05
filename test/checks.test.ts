import { describe, expect, test } from 'bun:test'
import { check } from '../src/checks'
import { LANGUAGES, type Language } from '../src/languages'
// Withdrawn languages (Bengali, Odia) are bench candidates; their text still reaches the checks.
import { CANDIDATES } from '../bench/candidates'

const hi = LANGUAGES.hi
const kn = LANGUAGES.kn
/** Urdu is not offered (withdrawn 2026-10-04), but its text still reaches the checks. */
const ur: Language = { code: 'ur', name: 'Urdu', native: 'اردو', from: 'English', script: /[؀-ۿ]/g, length: 0.97, dir: 'rtl', examples: [] }

describe('a faithful translation raises nothing', () => {
  test('Hindi with code, a link and a number', () => {
    expect(check('Run `npm install`, then read the [setup guide](#1). It takes 5 minutes.',
      '`npm install` चलाएँ, फिर [सेटअप गाइड](#1) पढ़ें। इसमें 5 मिनट लगते हैं।', hi)).toEqual([])
  })

  test('Kannada with emphasis and a wikilink alias', () => {
    expect(check('Read **[[#1|this page]]** first.', 'ಮೊದಲು **[[#1|ಈ ಪುಟ]]** ಓದಿ.', kn)).toEqual([])
  })

  test('a short heading is not flagged as short', () => {
    expect(check('Getting started', 'शुरुआत', hi)).toEqual([])
  })

  test('acronyms and names in Latin script are not untranslated text', () => {
    expect(check('FDA MDR (21 CFR 803) + MedWatch', 'FDA MDR (21 CFR 803) + MedWatch', hi)).toEqual([])
  })

  test('Hindi into English', () => {
    expect(check('यह कैसे काम करता है?', 'How does it work?', LANGUAGES.en)).toEqual([])
  })

  test('a year in Kannada digits is the same number in Latin digits', () => {
    expect(check('೨೦೨೦ರ ಏಪ್ರಿಲ್ ತಿಂಗಳಲ್ಲಿ ಲಸಿಕೆ ಬಂತು', 'The vaccine came in April 2020', LANGUAGES.en)).toEqual([])
    expect(check('Proposed in 2025.', '२०२५ में प्रस्तावित।', hi)).toEqual([])
  })

  test('a number grouped or pointed in another way is the same number', () => {
    expect(check('It costs 1,000-2,500 rupees.', 'इसकी कीमत 1000-2500 रुपये है।', hi)).toEqual([])
    expect(check('About 50,000 people, up 4.7 percent.', 'تقریباً 50٬000 لوگ، 4٫7 فیصد زیادہ۔', ur)).toEqual([])
  })

  test('Tamil runs longer than English, so its English is not short', () => {
    // IN22-Gen (AI4Bharat, CC BY 4.0), human translation: English is 0.67 of the Tamil's length.
    expect(check('யோகா என்ற சொல் யுஜ் என்ற சம்ஸ்கிருத வேர்ச்சொல்லிருந்து பிறக்கிறது, அதற்கு இணைத்தல், பிணைத்துக் கட்டுதல் அல்லது ஒன்றுபடுதல் என்று அர்த்தம்.',
      'The word Yoga is derived from the Sanskrit root Yuj, meaning to join or to yoke or to unite.', LANGUAGES.en)).toEqual([])
  })

  test('English already, into English', () => {
    expect(check('Key legal mechanics on the FDA side', 'Key legal mechanics on the FDA side', LANGUAGES.en)).toEqual([])
  })
})

describe('each failure seen in the trials is caught', () => {
  test('English returned unchanged', () => {
    expect(check('Key legal mechanics on the FDA side', 'Key legal mechanics on the FDA side', hi)).toContain('untranslated')
  })

  test('Kannada returned unchanged when asked for English', () => {
    expect(check('ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ', LANGUAGES.en)).toContain('untranslated')
  })

  test('a short block returned unchanged', () => {
    // Urdu, no examples, in the browser 2026-10-04: a heading and a code line
    // came back as they went in, unflagged; too short for the share rule.
    expect(check('How it works', 'How it works', ur)).toContain('untranslated')
    expect(check('Run `npm test` first', 'Run `npm test` first', hi)).toContain('untranslated')
  })

  test('a name kept as it was is not an echo', () => {
    expect(check('GitHub', 'GitHub', hi)).toEqual([])
    expect(check('NASA', 'NASA', hi)).toEqual([])
  })

  // Seen in bench/starts.ts, 2026-10-04: short blocks at the start of a document.
  test('a one-word heading returned unchanged', () => {
    expect(check('Installation', 'Installation', CANDIDATES.ory_Orya)).toContain('untranslated')
  })

  test('a short block in another script', () => {
    expect(check('How it works', 'କିପରି ଏହା କାମ କରେ', CANDIDATES.ben_Beng)).toEqual(['script'])
  })

  test('no letters at all', () => {
    expect(check('Why use it?', '"""', LANGUAGES.ta)).toContain('empty')
  })

  test('a related language in the same script, where its letters give it away', () => {
    // bench/starts.ts: Bengali answered in Assamese (ৰ), Nepali with Sindhi letters (ॾ).
    expect(check('Getting started', 'আৰম্ভণি', CANDIDATES.ben_Beng)).toEqual(['script'])
    expect(check('Why use it?', 'ॾांयै?', LANGUAGES.ne)).toContain('script')
    expect(check('Getting started', 'শুরু করা', CANDIDATES.ben_Beng)).toEqual([])
  })

  test("the language's own name instead of a translation", () => {
    expect(check('How it works', 'తెలుగు', LANGUAGES.te)).toContain('unrelated')
  })

  test("an earlier block's answer given again for a different source", () => {
    expect(check('It keeps your notes in one place.', 'ॾांयै?', LANGUAGES.ne, [['Why use it?', 'ॾांयै?']])).toContain('unrelated')
    expect(check('Why use it?', 'किन प्रयोग गर्ने?', LANGUAGES.ne, [['Why use it?', 'किन प्रयोग गर्ने?']])).toEqual([])
  })

  test('another language in another script', () => {
    // Asked for Bodo, sarvam-30b wrote Assamese; one stray Devanagari letter
    // once made this read as wholly on target.
    expect(check('Run the tests before you push the branch.', 'শাখা পুছ কৰাৰ আগতে পৰীক্ষাসমূহ চলাওক ऀ', hi)).toEqual(['script'])
  })

  test('Hindi written in Latin letters', () => {
    expect(check('The server reads the file only when the flag is set.',
      'Server file ko sirf tab padhta hai jab flag set ho.', hi)).toContain('untranslated')
  })

  test('half the block left in English', () => {
    expect(check('**Reporting would trigger if:** the function is a device or is bundled with one.',
      '**रिपोर्टिंग होगी यदि:** the function is a device or is bundled with one.', hi)).toContain('partial')
  })

  test('half the block left in Hindi, into English', () => {
    expect(check('यह योजना अगले साल शुरू होगी और सभी जिलों में लागू की जाएगी।',
      'The scheme will start next year और सभी जिलों में लागू की जाएगी।', LANGUAGES.en)).toContain('partial')
  })

  test('a short sentence may run long; only a real addition is flagged', () => {
    // bench/starts.ts, Nepali with examples: complete translations of short
    // sentences, flagged long against a median measured on long ones.
    expect(check('This project is free to use.', 'यो परियोजना प्रयोग गर्न पूर्ण रूपमा निःशुल्क छ।', LANGUAGES.ne)).toEqual([])
    // Bengali: the translation, then the English again.
    expect(check('See the LICENSE file', 'লাইসেন্স ফাইলটি দেখুন। See the LICENSE file again', LANGUAGES.bn)).toContain('long')
  })

  test('a sentence added that the source does not have', () => {
    expect(check('The meeting is on Tuesday at noon in the main hall.',
      'बैठक मंगलवार को दोपहर में मुख्य हॉल में है। कृपया समय पर पहुँचें और अपना पहचान पत्र साथ लाएँ।', hi)).toContain('long')
  })

  test('emphasis added that the source does not have', () => {
    expect(check('Scope holes: zero obligation.', '*स्कोप होल*: शून्य दायित्व।', hi)).toContain('markup')
  })

  test('a link target lost', () => {
    expect(check('See [the docs](#1) first.', 'पहले दस्तावेज़ देखें।', hi)).toContain('markup')
  })

  test('a number changed', () => {
    expect(check('Proposed in Sept 2025.', 'सितंबर 2020 में प्रस्तावित।', hi)).toContain('numbers')
  })

  test('a sentence dropped', () => {
    expect(check('The exhibit lands as a plain static site. Archie still never runs a server and never holds your work.',
      'आर्ची कभी सर्वर नहीं चलाता।', hi)).toContain('short')
  })

  test('commentary added after the answer', () => {
    expect(check('See the docs and the FAQ first.',
      'पहले दस्तावेज़ और FAQ देखें। (नोट: यह एक शाब्दिक अनुवाद है, एक अधिक स्वाभाविक अनुवाद भी संभव है जो बेहतर हो सकता है।)', hi)).toContain('long')
  })

  test('cut off with an ellipsis', () => {
    expect(check('Yes — manufacturer reports to competent authority via EUDAMED', 'हाँ — निर्माता रिपोर्ट करता है...', hi)).toContain('truncated')
  })

  test('nothing came back', () => {
    expect(check('Some text here.', '  ', hi)).toEqual(['empty'])
  })
})

describe('an answer whose form drifted from its source', () => {
  const en = LANGUAGES.en

  test('a comma after every word is flagged: the cascade seen on a brochure', () => {
    expect(check('ನಮ್ಮ ಪದಾರ್ಥಗಳು ಎಲ್ಲಿಂದ ಬರುತ್ತವೆ ಎಂಬುದು ನಮಗೆ ಯಾವಾಗಲೂ ತಿಳಿದಿರುತ್ತದೆ.',
      'Our, ingredients, come, from, where, we, always, know', en)).toContain('form')
  })

  test('a list with a comma after every item is not, when the source is one too', () => {
    expect(check('ರಾಗಿ, ನವಣೆ, ಸಾಮೆ, ಜೋಳ, ಸಜ್ಜೆ', 'Ragi, foxtail, little millet, jowar, bajra', en)).not.toContain('form')
  })

  test('a phrase looped is flagged', () => {
    expect(check('Read the guide before you start.',
      'शुरू करने से पहले गाइड पढ़ें गाइड पढ़ें गाइड पढ़ें गाइड पढ़ें गाइड पढ़ें', hi)).toContain('form')
  })

  test('an English answer in capitals throughout is flagged', () => {
    expect(check('ನಮ್ಮ ಉತ್ಪನ್ನಗಳು ನಂಬಿಕಸ್ಥ ರೈತರಿಂದ ಬರುತ್ತವೆ.', 'OUR PRODUCTS COME FROM TRUSTED FARMERS.', en)).toContain('form')
  })

  test('acronyms in capitals are not', () => {
    expect(check('ಎಫ್‌ಡಿಎ ಎಂಡಿಆರ್ ವರದಿ', 'FDA MDR report', en)).not.toContain('form')
  })
})
