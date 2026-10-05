import { describe, expect, test } from 'bun:test'
import { OCR_CANDIDATES } from '../bench/ocr'
import { LANGUAGES } from '../src/languages'
import { escapeMarkdown, hardWords, imageLanguage, imageLanguages, models, nextHard, pageText, stillHard, type ReadBlock } from '../src/ocr'

/** Tesseract's output for lines of words, each word at the given confidence.
 *  A line is as wide as its text, ten pixels a character, unless given a width. */
const block = (...paras: [string, number?, number?][][]): ReadBlock => ({
  paragraphs: paras.map((lines) => ({
    lines: lines.map(([text, confidence = 95, width = text.length * 10]) => ({
      text: text + '\n',
      bbox: { x0: 0, x1: width },
      words: text.split(/\s+/).filter(Boolean).map((w) => ({ text: w, confidence })),
    })),
  })),
})

describe('which languages an image may be in', () => {
  test('offers exactly the thirteen bench/ocr.ts did not fail', () => {
    expect(imageLanguages().map((l) => l.code).sort()).toEqual(
      ['as', 'bn', 'brx', 'doi', 'en', 'gom', 'gu', 'hi', 'kn', 'mai', 'mr', 'pa', 'sd'],
    )
  })

  test('reads each with the model the bench measured', () => {
    for (const l of imageLanguages()) expect(l.ocr!.model).toBe(OCR_CANDIDATES[l.code].model)
  })

  test('names the language whose model is borrowed', () => {
    for (const l of imageLanguages()) {
      const own = Object.values(LANGUAGES).find((o) => o.ocr?.model === l.ocr!.model && !o.ocr?.borrowed)!
      expect(l.ocr!.borrowed).toBe(own.code === l.code ? undefined : own.name)
    }
  })

  test('is English when translating from English, whatever was chosen', () => {
    expect(imageLanguage('ta', 'bn')).toBe('en')
  })

  test('is the chosen language when translating into English', () => {
    expect(imageLanguage('en', 'bn')).toBe('bn')
  })

  test('falls back to Hindi when the chosen language cannot be read', () => {
    expect(imageLanguage('en', 'ta')).toBe('hi')
  })
})

describe('the text an image becomes', () => {
  test('joins the lines of a paragraph and separates paragraphs by a blank line', () => {
    const b = block([['जो वकील होकर', 95, 210], ['अदालतों को छोड़ देगा।']], [['दूसरा अनुच्छेद।']])
    expect(pageText([b])).toBe('जो वकील होकर अदालतों को छोड़ देगा।\n\nदूसरा अनुच्छेद।')
  })

  test('joins a Latin word hyphenated across a line', () => {
    expect(pageText([block([['the recom-'], ['mendation was']])])).toBe('the recommendation was')
  })

  test('keeps a hyphen at a line end that joins two words', () => {
    expect(pageText([block([['वादी-', 95, 90], ['प्रतिवादी']])])).toBe('वादी-प्रतिवादी')
  })

  test('ends a paragraph after a line much shorter than its widest', () => {
    // An index, a list or a poem: Tesseract calls the whole column one paragraph.
    const b = block([['Apples, 12'], ['Bananas and other fruit, 40'], ['Cherries, 7']])
    expect(pageText([b])).toBe('Apples, 12\n\nBananas and other fruit, 40\n\nCherries, 7')
  })

  test('joins the full-width lines of prose before a short last line', () => {
    const b = block([['the first line runs the width'], ['and so does the second one'], ['then it ends.'], ['A new one starts here and runs'], ['to its end.']])
    expect(pageText([b])).toBe('the first line runs the width and so does the second one then it ends.\n\nA new one starts here and runs to its end.')
  })

  test('drops a paragraph Tesseract was unsure of in every word: a graphic read as letters', () => {
    // A brochure's flowchart arrows came back as ಸ, ಠ್‌, ನ, ೯, each its own paragraph.
    const b = block([['ಸ', 20]], [['01 ತಾಜಾ ಉತ್ಪನ್ನಗಳು', 90]], [['ಠ್‌ ನ', 35]])
    expect(pageText([b])).toBe('01 ತಾಜಾ ಉತ್ಪನ್ನಗಳು')
    expect(hardWords([b])).toEqual([])
  })

  test('keeps a paragraph with one sure word among unsure ones', () => {
    expect(pageText([block([['ಮಸುಕು', 30, 300], ['ಸ್ಪಷ್ಟ ಪಠ್ಯ', 90, 300]])])).toBe('ಮಸುಕು ಸ್ಪಷ್ಟ ಪಠ್ಯ')
  })

  test('drops empty lines and paragraphs', () => {
    expect(pageText([block([['  '], ['text']], [[' ']])])).toBe('text')
  })

  test('cannot become Markdown it never was', () => {
    expect(pageText([block([['# 5 is *not* a [link] or `code`']])])).toBe('\\# 5 is \\*not\\* a \\[link\\] or \\`code\\`')
  })
})

describe('the models an image is read with', () => {
  test("is the language's own model alone by default", () => {
    expect(models('kn', false)).toBe('kan')
  })

  test('adds English when the image also has English', () => {
    expect(models('kn', true)).toBe('kan+eng')
  })

  test('is English alone for English, asked or not', () => {
    expect(models('en', true)).toBe('eng')
  })
})

describe('escapeMarkdown', () => {
  test('escapes a list marker, a numbered item and a quote at the start only', () => {
    expect(escapeMarkdown('- one - two')).toBe('\\- one - two')
    expect(escapeMarkdown('12. Item')).toBe('12\\. Item')
    expect(escapeMarkdown('> said')).toBe('\\> said')
  })

  test('leaves a number in a sentence alone', () => {
    expect(escapeMarkdown('In 2026. it was')).toBe('In 2026. it was')
  })
})

describe('hard words', () => {
  test('lists words below the confidence floor, once each, in reading order', () => {
    const b = block([['good', 95], ['ब्लर', 40], ['good', 95]], [['ब्लर', 30], ['धुंध', 50], ['साफ़', 90]])
    expect(hardWords([b])).toEqual(['ब्लर', 'धुंध'])
  })

  test('never lists marks or numbers', () => {
    expect(hardWords([block([['—', 10], ['१२', 10]])])).toEqual([])
  })

  test('forgets a word the owner corrected', () => {
    expect(stillHard('the corrected text', ['corected', 'text'])).toEqual(['text'])
  })
})

describe('nextHard', () => {
  const text = 'alpha beta gamma beta'

  test('finds the earliest hard word after the cursor', () => {
    expect(nextHard(text, ['gamma', 'beta'], 7)).toEqual({ start: 11, end: 16 })
  })

  test('wraps to the start when none is after the cursor', () => {
    expect(nextHard(text, ['beta'], 20)).toEqual({ start: 6, end: 10 })
  })

  test('is null when every hard word is gone', () => {
    expect(nextHard(text, ['delta'], 0)).toBeNull()
  })
})
