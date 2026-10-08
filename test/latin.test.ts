import { expect, test } from 'bun:test'
import { languages } from 'indickit/romanize'
import { LANGUAGES } from '../src/languages'
import { hasLatin, latinText } from '../src/latin'

test('every language offered as a target has Latin letters, and English has none', () => {
  const targets = Object.keys(LANGUAGES).filter((c) => c !== 'en')
  expect(targets.filter((c) => !hasLatin(c))).toEqual([])
  expect(targets.filter((c) => !languages('words').includes(c))).toEqual([])
  expect(hasLatin('en')).toBe(false)
})

test('a danda, a double danda and the Urdu full stop become a full stop', () => {
  const same = { text: (t: string) => t } 
  expect(latinText(same, 'khole। kahaa॥ kiyaa۔')).toBe('khole. kahaa. kiyaa.')
})
