import { describe, expect, test } from 'bun:test'
import { languages } from 'indickit/deromanize'
import { LANGUAGES } from '../src/languages'
import type { Completion } from '../src/llm'
import { mask } from '../src/segment'
import { translateDocument, type TranslateOptions } from '../src/translate'
import { hasTyped, typedText } from '../src/typed'

/** A converter that writes each run of Latin letters in capitals, as the real one writes a script. */
const caps = { text: (t: string) => t.replace(/[A-Za-z]+/g, (w) => w.toUpperCase()) }

test('every language offered as a target but Sindhi can be typed in Latin letters; English cannot', () => {
  const targets = Object.keys(LANGUAGES).filter((c) => c !== 'en')
  expect(targets.filter((c) => !hasTyped(c))).toEqual(['sd'])
  expect(targets.filter((c) => c !== 'sd' && !languages('words').includes(c))).toEqual([])
  expect(hasTyped('en')).toBe(false)
})

describe('typedText', () => {
  test('writes the prose and keeps inline code, addresses and masked link targets', () => {
    const { text } = mask('Kal subah 10 baje `npm install` chalana, aur https://example.com par [3 bugs](https://x.y/z) dekhna, mail me@x.in.')
    expect(typedText(caps, text)).toBe('KAL SUBAH 10 BAJE `npm install` CHALANA, AUR https://example.com PAR [3 BUGS](#1) DEKHNA, MAIL me@x.in.')
  })

  test('keeps emphasis marks and a wikilink target, and writes its alias', () => {
    const { text } = mask('**Kal** ka plan: [[Meeting notes|kal ki meeting]] dekho.')
    expect(typedText(caps, text)).toBe('**KAL** KA PLAN: [[#1|KAL KI MEETING]] DEKHO.')
  })

  test('text with nothing to keep goes through whole', () => {
    expect(typedText(caps, 'kal meeting hai')).toBe('KAL MEETING HAI')
    expect(typedText(caps, '')).toBe('')
  })
})

describe('translateDocument with a typed source', () => {
  /** A converter that writes each Latin word as a run of क, so the checks see a script. */
  const deva = { text: (t: string) => t.replace(/[A-Za-z]+/g, (w) => 'क'.repeat(w.length)) }
  const opts: TranslateOptions = {
    language: LANGUAGES.en,
    preamble: 'From {S} into {L}.',
    examples: [['An English example.', 'Its answer.']],
    contextBlocks: 2,
    passageLength: 1200,
    retries: 0,
    skipKeys: [],
    typed: { language: LANGUAGES.hi, convert: (t) => typedText(deva, t) },
  }
  const model = (answer: string) => {
    const prompts: string[] = []
    const complete = async (req: Completion) => ((prompts.push(req.prompt), answer))
    return { complete, prompts }
  }

  test('the model sees the block written in the script, labelled with the typed language, and no English examples', async () => {
    const { complete, prompts } = model('The `npm` meeting is tomorrow.')
    const r = await translateDocument('Kal `npm` meeting hai.\n', opts, complete, () => {})
    expect(prompts[0]).toBe('From Hindi into English.\n\nHindi: ककक `npm` ककककककक ककक.\nEnglish:')
    expect(r.units[0]).toMatchObject({ typed: 'Kal `npm` meeting hai.', output: 'The `npm` meeting is tomorrow.', flags: [] })
    expect(r.units[0].unit.text).toBe('ककक `npm` ककककककक ककक.')
    expect(r.markdown).toBe('The `npm` meeting is tomorrow.\n')
  })

  test('a block with no answer yet shows what the owner typed, not the script', async () => {
    const { complete } = model('')
    const r = await translateDocument('Kal meeting hai.\n', opts, complete, () => {})
    expect(r.units[0].flags).toEqual(['empty'])
    expect(r.markdown).toBe('Kal meeting hai.\n')
  })

  test('the checks take the source for the typed language: an answer left in its script is not translated', async () => {
    const { complete } = model('कल मीटिंग है।')
    const r = await translateDocument('Kal meeting hai.\n', opts, complete, () => {})
    expect(r.units[0].flags).toEqual(['untranslated'])
  })

  test('the edit memory is keyed by the text in the script', async () => {
    const { complete, prompts } = model('x')
    const remembered = { 'ककक ककककककक ककक.': 'The meeting is tomorrow.' }
    const r = await translateDocument('Kal meeting hai.\n', { ...opts, remembered }, complete, () => {})
    expect(prompts).toEqual([])
    expect(r.units[0]).toMatchObject({ output: 'The meeting is tomorrow.', edited: true })
  })
})
