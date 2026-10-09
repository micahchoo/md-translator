import { describe, expect, test } from 'bun:test'
import { languages } from 'indickit/deromanize'
import { LANGUAGES } from '../src/languages'
import { mask } from '../src/segment'
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
