// A raw-completion client for any OpenAI-compatible `/v1/completions`
// endpoint (llama.cpp, Ollama, vLLM). Raw completion, not chat: the prompt
// is parallel text and must reach the model exactly as built.

export interface Completion {
  prompt: string
  temperature: number
  seed: number
  maxTokens: number
  stop: string[]
}

/** Streams one completion. `onText` gets the whole text so far after each delta. */
export type Complete = (req: Completion, onText: (soFar: string) => void, signal?: AbortSignal) => Promise<string>

export interface Endpoint {
  /** Base URL, e.g. `http://localhost:8086`; a trailing `/v1` is accepted. */
  endpoint: string
  model: string
  /** A hosted model's key, sent as a bearer token; absent for a local server. */
  apiKey?: string
}

const auth = (apiKey?: string): Record<string, string> => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {})

export function completionsUrl(base: string): string {
  return base.trim().replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/completions'
}

/**
 * Chrome lets an https page (GitHub Pages) call a private-network address over
 * http only when the fetch declares it local. `localhost` is already treated
 * as secure and needs no flag; declaring it wrongly could get it refused.
 */
export function addressSpace(base: string): 'local' | undefined {
  let host: string
  try {
    host = new URL(base).hostname
  } catch {
    return undefined
  }
  const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || host.endsWith('.local')
  return priv ? 'local' : undefined
}

/** Parses server-sent events; `rest` is an incomplete tail to prepend to the next chunk. */
export function sseTexts(buffer: string): { texts: string[]; rest: string; done: boolean } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const texts: string[] = []
  let done = false
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') {
      done = true
      continue
    }
    const text = JSON.parse(data)?.choices?.[0]?.text
    if (typeof text === 'string' && text) texts.push(text)
  }
  return { texts, rest, done }
}

export function createClient(ep: Endpoint, fetchImpl: typeof fetch = fetch.bind(globalThis)): Complete {
  return async (req, onText, signal) => {
    const space = addressSpace(ep.endpoint)
    const res = await fetchImpl(completionsUrl(ep.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(ep.apiKey) },
      body: JSON.stringify({
        model: ep.model,
        prompt: req.prompt,
        temperature: req.temperature,
        seed: req.seed,
        max_tokens: req.maxTokens,
        stop: req.stop,
        stream: true,
      }),
      signal,
      ...(space ? { targetAddressSpace: space } : {}),
    } as RequestInit)
    if (!res.ok || !res.body) throw new Error(`${res.status}: ${(await res.text()).trim() || res.statusText}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const parsed = sseTexts(buffer + decoder.decode(value, { stream: true }))
      buffer = parsed.rest
      for (const t of parsed.texts) {
        text += t
        onText(text)
      }
      if (parsed.done) break
    }
    return text
  }
}

/** Lists the endpoint's models: the cheapest proof that it is reachable. */
export async function listModels(base: string, fetchImpl: typeof fetch = fetch.bind(globalThis), apiKey?: string): Promise<string[]> {
  const space = addressSpace(base)
  const res = await fetchImpl(completionsUrl(base).replace(/completions$/, 'models'), {
    headers: auth(apiKey),
    ...(space ? { targetAddressSpace: space } : {}),
  } as RequestInit)
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
  const body = await res.json()
  return (body?.data ?? []).map((m: { id: string }) => m.id)
}
