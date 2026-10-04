import { describe, expect, test } from 'bun:test'
import { dropNegation, lostNegation, otherLanguage, RELATED } from '../src/judge'

describe('dropNegation', () => {
  test('takes the negation out, straight or curly apostrophe', () => {
    expect(dropNegation('It is not safe.')).toBe('It is safe.')
    expect(dropNegation('It doesn’t work.')).toBe('It does work.')
    expect(dropNegation("You can't stay.")).toBe('You can stay.')
  })

  test('a sentence with nothing to take out has no partner', () => {
    expect(dropNegation('It is safe.')).toBeNull()
  })
})

// A fake scorer: likelier wherever the prompt holds the given marker.
const prefers = (marker: string) => async (prefix: string) => (prefix.includes(marker) ? -1 : -9)

describe('lostNegation', () => {
  test('true when the answer is likelier after the source without its "not"', async () => {
    expect(await lostNegation(prefers('is safe'), 'It is not safe.', 'It is safe.', 'x')).toBe(true)
    expect(await lostNegation(prefers('not safe'), 'It is not safe.', 'It is safe.', 'x')).toBe(false)
  })
})

describe('otherLanguage', () => {
  test('names the related language whose label explains the answer best, or nothing', async () => {
    const prompts = { Hindi: 'P Hindi:', Marathi: 'P Marathi:', Nepali: 'P Nepali:' }
    expect(await otherLanguage(prefers('Marathi:'), prompts, 'Hindi', 'x')).toBe('Marathi')
    expect(await otherLanguage(prefers('Hindi:'), prompts, 'Hindi', 'x')).toBeNull()
  })

  test('only measured pairs are checked', () => {
    expect(RELATED.hi).toEqual(['mr', 'ne'])
    expect(RELATED.as).toEqual(['bn'])
    expect(RELATED.ta).toBeUndefined()
  })
})
