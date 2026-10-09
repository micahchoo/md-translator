import { describe, expect, test } from 'bun:test'
import { createScorer, dropNegation, lostNegation, otherLanguage, probe, RELATED } from '../src/judge'

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

/** A llama.cpp stand-in: a text's tokens are its words numbered from 1, and the likeliest next token is always 2, at -0.5. */
function llamaFake(seen: { url: string; auth: string | null }[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.push({ url, auth: new Headers(init?.headers).get('authorization') })
    const body = JSON.parse(String(init?.body))
    if (url.endsWith('/tokenize')) return Response.json({ tokens: body.content.split(' ').map((_: string, i: number) => i + 1) })
    return Response.json({ completion_probabilities: [{ top_logprobs: [{ id: 2, logprob: -0.5 }, { id: 9, logprob: -3 }] }] })
  }) as unknown as typeof fetch
}

describe('the scorer on a llama.cpp server', () => {
  test("sums the log probability of the text's tokens after the prefix, and every request carries the key", async () => {
    const seen: { url: string; auth: string | null }[] = []
    const score = createScorer({ endpoint: 'https://gpu.example.com/v1', apiKey: 'sk-1' }, llamaFake(seen))
    expect(await score('a', ' b')).toBe(-0.5)
    expect(seen.map((s) => s.url)).toEqual(['https://gpu.example.com/tokenize', 'https://gpu.example.com/tokenize', 'https://gpu.example.com/completion'])
    expect(seen.every((s) => s.auth === 'Bearer sk-1')).toBe(true)
  })

  test('probe says yes where /tokenize answers with tokens, asking with the key, and no where it does not', async () => {
    const seen: { url: string; auth: string | null }[] = []
    expect(await probe({ endpoint: 'http://localhost:8086', apiKey: 'k' }, llamaFake(seen))).toBe(true)
    expect(seen[0]).toEqual({ url: 'http://localhost:8086/tokenize', auth: 'Bearer k' })
    expect(await probe({ endpoint: 'http://localhost:8086' }, (async () => new Response('', { status: 404 })) as unknown as typeof fetch)).toBe(false)
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
