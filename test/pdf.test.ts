import { describe, expect, test } from 'bun:test'
import { LANGUAGES } from '../src/languages'
import { damage, layerText, pageVerdict, type LayerItem } from '../src/pdf'

/** pdf.js text items: each line a run of words at height 10, `gap` points below the last. */
const items = (...lines: [string, number?][]): LayerItem[] => {
  let y = 700
  return lines.flatMap(([text, gap = 12]) => {
    y -= gap
    return [
      { str: text, hasEOL: false, transform: [10, 0, 0, 10, 72, y], height: 10 },
      { str: '', hasEOL: true, transform: [1, 0, 0, 1, 72, y], height: 0 },
    ]
  })
}

describe('a text layer into Markdown', () => {
  test('joins the lines of a paragraph', () => {
    expect(layerText(items(['IIHS has a code'], ['for every vendor.']))).toBe('IIHS has a code for every vendor.')
  })

  test('starts a paragraph where the gap is wider than a line and a half', () => {
    expect(layerText(items(['Introduction'], ['IIHS has a code', 28], ['for every vendor.']))).toBe('Introduction\n\nIIHS has a code for every vendor.')
  })

  test('starts a paragraph where the text jumps back up the page: a new column', () => {
    expect(layerText(items(['end of column one'], ['top of column two', -400]))).toBe('end of column one\n\ntop of column two')
  })

  test('joins the runs of one line as pdf.js gives them, spaces included', () => {
    const run: LayerItem[] = ['IIHS', ' ', 'has'].map((str, i) => ({ str, hasEOL: false, transform: [10, 0, 0, 10, 72 + i * 20, 600], height: 10 }))
    expect(layerText(run)).toBe('IIHS has')
  })

  test('cannot become Markdown it never was', () => {
    expect(layerText(items(['# 1 *note*']))).toBe('\\# 1 \\*note\\*')
  })
})

describe('damage: breaks of the Indic syllable rules, per letter', () => {
  test('is none in any language’s examples, which people wrote', () => {
    for (const l of Object.values(LANGUAGES)) for (const [, t] of l.examples) expect(damage(t)).toBe(0)
  })

  test('counts a virama after a vowel sign, and a doubled virama', () => {
    // pdf.js on an InDesign handout: திறன்மிகு came back as தி்றன்்மிகு.
    expect(damage('தி்றன்்மிகு')).toBeGreaterThan(0.1)
  })

  test('counts a vowel sign that starts a word', () => {
    expect(damage('ि हिंदी')).toBeGreaterThan(0)
  })

  test('is none in English, which has no syllable marks', () => {
    expect(damage('Vendor Code of Conduct')).toBe(0)
  })
})

describe('whether a page’s text layer is used or the page is read', () => {
  test('uses a sound layer in the expected script', () => {
    expect(pageVerdict('यह कैसे काम करता है, और क्या यह ऑफ़लाइन काम करता है?', 'hi')).toBe('layer')
  })

  test('reads a page with no text: a scan', () => {
    expect(pageVerdict('  12 ', 'hi')).toBe('empty')
  })

  test('reads a page whose letters are not the expected script: a legacy font', () => {
    // Krutidev Hindi in a text layer: Latin letters standing for Devanagari.
    expect(pageVerdict(';g dSls dke djrk gS] vkSj D;k ;g vkWQykbu dke djrk gS', 'hi')).toBe('script')
  })

  test('reads a page whose layer breaks the syllable rules', () => {
    expect(pageVerdict('ஆற்்றல் தி்றன்்மிகு குடியிருப்புகள் காலநிலல-ஸ்்மார்ட் தமிழ்்நாட்டிற்்கான', 'ta')).toBe('damaged')
  })

  test('uses an English layer for English', () => {
    expect(pageVerdict('IIHS has a code of conduct for every vendor it works with.', 'en')).toBe('layer')
  })
})
