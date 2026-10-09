import { describe, expect, test } from 'bun:test'
import { addressSpace, createClient, listModels, serverFetch, serverUrl, sseTexts } from '../src/llm'

describe('serverUrl', () => {
  test('accepts a base URL with or without /v1 and a trailing slash', () => {
    expect(serverUrl('http://localhost:8086', '/v1/completions')).toBe('http://localhost:8086/v1/completions')
    expect(serverUrl('http://localhost:8086/', '/v1/completions')).toBe('http://localhost:8086/v1/completions')
    expect(serverUrl('http://localhost:8086/v1/', '/tokenize')).toBe('http://localhost:8086/tokenize')
  })
})

describe('serverFetch', () => {
  test('declares a private address local and keeps the request\'s own headers beside the key', async () => {
    const seen: { url: string; init: RequestInit & { targetAddressSpace?: string } }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => (seen.push({ url, init }), new Response('ok'))) as unknown as typeof fetch
    await serverFetch({ endpoint: 'http://192.168.0.5:8086/v1', apiKey: 'k' }, '/completion', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, fetchImpl)
    await serverFetch({ endpoint: 'http://localhost:8086' }, '/v1/models', {}, fetchImpl)
    expect(seen[0].url).toBe('http://192.168.0.5:8086/completion')
    expect(seen[0].init.targetAddressSpace).toBe('local')
    expect(seen[0].init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer k' })
    expect(seen[1].init.targetAddressSpace).toBeUndefined()
    expect(seen[1].init.headers).toEqual({})
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

describe('an API key', () => {
  const sse = () => new Response('data: {"choices":[{"text":"ok"}]}\n\ndata: [DONE]\n\n')
  const headers = (init?: RequestInit) => new Headers(init?.headers)

  test('goes to a hosted model as a bearer token, on completions and on the model list', async () => {
    const seen: Headers[] = []
    const fetchImpl = (async (_: string, init?: RequestInit) => (seen.push(headers(init)), _.endsWith('/models') ? Response.json({ data: [] }) : sse())) as typeof fetch
    await createClient({ endpoint: 'https://openrouter.ai/api/v1', model: 'm', apiKey: 'sk-1' }, fetchImpl)({ prompt: 'p', temperature: 0, seed: 1, maxTokens: 4, stop: [] }, () => {})
    await listModels({ endpoint: 'https://openrouter.ai/api/v1', apiKey: 'sk-1' }, fetchImpl)
    expect(seen.map((h) => h.get('authorization'))).toEqual(['Bearer sk-1', 'Bearer sk-1'])
  })

  test('without one, no Authorization header is sent', async () => {
    const seen: Headers[] = []
    const fetchImpl = (async (_: string, init?: RequestInit) => (seen.push(headers(init)), sse())) as typeof fetch
    await createClient({ endpoint: 'http://localhost:8086', model: 'm' }, fetchImpl)({ prompt: 'p', temperature: 0, seed: 1, maxTokens: 4, stop: [] }, () => {})
    expect(seen[0].has('authorization')).toBe(false)
  })
})
