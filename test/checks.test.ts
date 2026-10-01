import { describe, expect, test } from 'bun:test'
import { check } from '../src/checks'
import { LANGUAGES } from '../src/languages'

const hi = LANGUAGES.hi
const kn = LANGUAGES.kn

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
})

describe('each failure seen in the trials is caught', () => {
  test('English returned unchanged', () => {
    expect(check('Key legal mechanics on the FDA side', 'Key legal mechanics on the FDA side', hi)).toContain('untranslated')
  })

  test('Hindi written in Latin letters', () => {
    expect(check('The server reads the file only when the flag is set.',
      'Server file ko sirf tab padhta hai jab flag set ho.', hi)).toContain('untranslated')
  })

  test('half the block left in English', () => {
    expect(check('**Reporting would trigger if:** the function is a device or is bundled with one.',
      '**रिपोर्टिंग होगी यदि:** the function is a device or is bundled with one.', hi)).toContain('partial')
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
