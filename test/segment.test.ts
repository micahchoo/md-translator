import { describe, expect, test } from 'bun:test'
import { assemble, segment, splitPassage, unmask } from '../src/segment'

const SKIP = ['notion-id', 'base', 'tags', 'aliases', 'cssclasses']
const texts = (md: string) => segment(md, { skipKeys: SKIP }).map((u) => u.text)

// Translate by a fixed table so a test reads as "this source, this output".
function translate(md: string, table: Record<string, string>) {
  const units = segment(md, { skipKeys: SKIP })
  return assemble(md, units, units.map((u) => table[u.text] ?? u.text))
}

describe('what reaches the model', () => {
  test('headings, paragraphs and list items are units; code never is', () => {
    const md = '# Title\n\nSome text.\n\n- one item\n- two item\n\n```sh\nnpm install\n```\n'
    expect(texts(md)).toEqual(['Title', 'Some text.', 'one item', 'two item'])
  })

  test('soft line breaks are joined, so a sentence is never cut in half', () => {
    expect(texts('The exhibit lands as a plain\nstatic site under your account.\n')).toEqual([
      'The exhibit lands as a plain static site under your account.',
    ])
  })

  test('link and image destinations are masked as numbered targets', () => {
    const [u] = segment('See [the docs](https://x.y/a "T") and ![a cat](cat.png).\n', { skipKeys: SKIP })
    expect(u.text).toBe('See [the docs](#1) and ![a cat](#2).')
    expect(unmask('देखें [डॉक्स](#1) और ![बिल्ली](#2)।', u.restore)).toBe(
      'देखें [डॉक्स](https://x.y/a "T") और ![बिल्ली](cat.png)।',
    )
  })

  test('a wikilink keeps its target; only the alias is offered for translation', () => {
    const [u] = segment('Read [[Recipes/Goda Masala|this page]] and [[Kala Masala]] first.\n', { skipKeys: SKIP })
    expect(u.text).toBe('Read [[#1|this page]] and [[#2]] first.')
    expect(unmask('पहले [[#1|यह पेज]] और [[#2]] पढ़ें।', u.restore)).toBe(
      'पहले [[Recipes/Goda Masala|यह पेज]] और [[Kala Masala]] पढ़ें।',
    )
  })

  test('a line of embeds or wikilinks alone is not sent', () => {
    expect(texts('![[Ingredients for 50 Mangoes.base]]\n\n## Recipe\n')).toEqual(['Recipe'])
  })

  test('a callout sends its title, never its type marker or link lines', () => {
    expect(texts('> [!note]+ Mango Pickles\n> [[Red chilly Mango Pickle]]\n> \n> [[Mustard Mango Pickle]]\n')).toEqual([
      'Mango Pickles',
    ])
  })

  test('table cells are units; the delimiter row is not', () => {
    expect(texts('| Regime | Scope |\n|---|---|\n| FDA MDR | Only devices |\n')).toEqual([
      'Regime',
      'Scope',
      'FDA MDR',
      'Only devices',
    ])
  })

  test('a block with no words is not sent', () => {
    expect(texts('`npm install`\n\n2026 · 42\n')).toEqual([])
  })
})

describe('front matter', () => {
  const fm = [
    '---',
    'notion-id: 321f2a1a-5b73-80fb',
    'base: "[[Ingredients for 60kg Udd (1).base]]"',
    'Ingredients: Split White lentil/ Udd/ Uddat dal',
    '"Source ": ""',
    'Quantity: 500',
    'Amount: "580"',
    'Note: "Keep dry"',
    'Maintained By:',
    '  - supriya nandgouli',
    '---',
    '',
    'Body text.',
    '',
  ].join('\n')

  test('values with words are units; keys, numbers, empties and skipped keys are not', () => {
    expect(texts(fm)).toEqual(['Split White lentil/ Udd/ Uddat dal', 'Keep dry', 'supriya nandgouli', 'Body text.'])
  })

  test('a translated value is written back without touching keys or other lines', () => {
    const out = translate(fm, { 'Keep dry': 'सूखा रखें', 'Body text.': 'मुख्य पाठ।' })
    expect(out).toContain('Note: "सूखा रखें"\n')
    expect(out).toContain('Quantity: 500\n')
    expect(out).toContain('\nमुख्य पाठ।\n')
  })

  test('spaces inside the quotes are not offered and stay where they were', () => {
    const md = '---\nIngredients: "Garlic "\n---\n'
    expect(texts(md)).toEqual(['Garlic'])
    expect(translate(md, { Garlic: 'लहसुन' })).toBe('---\nIngredients: "लहसुन "\n---\n')
  })

  test('an unquoted value that would break YAML is quoted', () => {
    const out = translate('---\nTitle: Pickles\n---\n', { Pickles: 'अचार: आम "खट्टा"' })
    expect(out).toBe('---\nTitle: "अचार: आम \\"खट्टा\\""\n---\n')
  })
})

describe('assembly', () => {
  test('untranslated text survives byte for byte', () => {
    const md = '---\nnotion-id: x\n---\n\n# Title\n\n```js\nconst a = 1\n```\n\n<div align="center">hi</div>\n\n1. Clean the jar.\n'
    const out = translate(md, { Title: 'शीर्षक', 'Clean the jar.': 'जार साफ करें।' })
    expect(out).toBe(
      '---\nnotion-id: x\n---\n\n# शीर्षक\n\n```js\nconst a = 1\n```\n\n<div align="center">hi</div>\n\n1. जार साफ करें।\n',
    )
  })

  test('a multi-line paragraph inside a quote becomes one quoted line', () => {
    expect(translate('> one line\n> and the next\n', { 'one line and the next': 'एक पंक्ति और अगली' })).toBe(
      '> एक पंक्ति और अगली\n',
    )
  })

  test('a callout keeps its marker and its link lines', () => {
    const md = '> [!note]+ Lemon Pickles\n> [[Sweet and Sour Lemon Pickle]]\n'
    expect(translate(md, { 'Lemon Pickles': 'नींबू का अचार' })).toBe(
      '> [!note]+ नींबू का अचार\n> [[Sweet and Sour Lemon Pickle]]\n',
    )
  })

  test('a newline inside a translation never breaks the block', () => {
    expect(translate('Some text.\n', { 'Some text.': 'कुछ\nपाठ।' })).toBe('कुछ पाठ।\n')
  })
})

describe('splitPassage', () => {
  test('a passage under the limit is one piece', () => {
    expect(splitPassage('One. Two.', 100)).toEqual(['One. Two.'])
  })

  test('a long passage splits at sentence ends and loses nothing', () => {
    const s = 'First sentence is here. Second one follows it. Third closes the paragraph.'
    const parts = splitPassage(s, 50)
    expect(parts.every((p) => p.length <= 50)).toBe(true)
    expect(parts.join(' ')).toBe(s)
  })

  test('never splits inside a link label', () => {
    const s = 'Read [the guide. It is long](#1) before you start. Then go on.'
    expect(splitPassage(s, 30)).toEqual(['Read [the guide. It is long](#1) before you start.', 'Then go on.'])
  })

  test('a sentence longer than the limit is kept whole', () => {
    const s = 'This single sentence is much longer than the limit allows.'
    expect(splitPassage(s, 10)).toEqual([s])
  })
})
