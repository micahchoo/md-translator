import { describe, expect, test } from 'bun:test'
import { addressSpace, completionsUrl, createClient, sseTexts } from '../src/llm'

describe('completionsUrl', () => {
  test('accepts a base URL with or without /v1 and a trailing slash', () => {
    expect(completionsUrl('http://localhost:8086')).toBe('http://localhost:8086/v1/completions')
    expect(completionsUrl('http://localhost:8086/')).toBe('http://localhost:8086/v1/completions')
    expect(completionsUrl('http://localhost:8086/v1/')).toBe('http://localhost:8086/v1/completions')
  })
})

describe('addressSpace', () => {
  test('a private address is declared local so Chrome lets an https page reach it', () => {
    expect(addressSpace('http://192.168.0.5:8086')).toBe('local')
    expect(addressSpace('http://10.0.0.2:8086')).toBe('local')
    expect(addressSpace('http://gpu-box.local:8086')).toBe('local')
  })

  test('localhost and public hosts are left undeclared', () => {
    expect(addressSpace('http://localhost:8086')).toBeUndefined()
    expect(addressSpace('http://127.0.0.1:8086')).toBeUndefined()
    expect(addressSpace('https://api.example.com')).toBeUndefined()
  })
})

describe('sseTexts', () => {
  test('reads text deltas and keeps a line cut between chunks for the next chunk', () => {
    const a = sseTexts('data: {"choices":[{"text":"नम"}]}\n\ndata: {"choices":[{"te')
    expect(a.texts).toEqual(['नम'])
    const b = sseTexts(a.rest + 'xt":"स्ते"}]}\n\ndata: [DONE]\n\n')
    expect(b.texts).toEqual(['स्ते'])
    expect(b.done).toBe(true)
  })
})

describe('createClient', () => {
  test('streams a raw completion request and returns the whole text', async () => {
    const sent: { url: string; body: any }[] = []
    const fetchFake = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) })
      const enc = new TextEncoder()
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('data: {"choices":[{"text":" नम"}]}\n\n'))
          c.enqueue(enc.encode('data: {"choices":[{"text":"स्ते"}]}\n\ndata: [DONE]\n\n'))
          c.close()
        },
      })
      return new Response(stream, { status: 200 })
    }) as unknown as typeof fetch
    const complete = createClient({ endpoint: 'http://localhost:8086', model: 'sarvam-30b' }, fetchFake)
    const partial: string[] = []
    const text = await complete({ prompt: 'p', temperature: 0, seed: 0, maxTokens: 64, stop: ['\n\n'] }, (s) => partial.push(s))
    expect(text).toBe(' नमस्ते')
    expect(partial).toEqual([' नम', ' नमस्ते'])
    expect(sent[0].url).toBe('http://localhost:8086/v1/completions')
    expect(sent[0].body).toEqual({ model: 'sarvam-30b', prompt: 'p', temperature: 0, seed: 0, max_tokens: 64, stop: ['\n\n'], stream: true })
  })

  test('a server error is reported with its status and message', async () => {
    const fetchFake = (async () => new Response('model not loaded', { status: 503 })) as unknown as typeof fetch
    const complete = createClient({ endpoint: 'http://localhost:8086', model: 'm' }, fetchFake)
    await expect(complete({ prompt: 'p', temperature: 0, seed: 0, maxTokens: 8, stop: [] }, () => {})).rejects.toThrow(
      '503: model not loaded',
    )
  })
})
