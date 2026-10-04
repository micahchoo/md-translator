// The model as its own judge: how likely it finds a given text after a given
// prompt. The server will not score a prompt (it ignores `echo`), so the text
// is walked one token at a time: each step asks for one next token with its
// top candidates, and reads off the probability of the token the text has.
//
// Forcing the text with a grammar instead was tried and rejected: the grammar
// fixes the letters, not the tokens, so the model spelled unlikely text letter
// by letter and the sum measured the spelling, not the language.
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:8086'
const TOP = 100

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${ENDPOINT}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.json() as Promise<T>
}

type Candidates = { id: number; logprob: number }[]
let last: unknown

/**
 * The top candidates for the next token, or undefined when no reply has them.
 * The reply's length is tried in turn. One token fails when the likeliest next
 * token is part of a multi-byte letter (Arabic script, often): the server holds
 * it back and returns no candidates. Several fail when one of them is a special
 * token the server's `--jinja` output check rejects with a 500. Only the first
 * token's candidates are read, so the length does not change the score.
 */
async function step(prompt: number[]): Promise<Candidates | undefined> {
  for (const n_predict of [4, 1, 2, 3]) {
    try {
      const res = await post<{ completion_probabilities?: { top_logprobs: Candidates }[] }>('/completion', {
        prompt, n_predict, n_probs: TOP, temperature: 0, cache_prompt: true,
        // Without this a step where the model would stop returns no candidates.
        ignore_eos: true,
      })
      last = res
      const top = res.completion_probabilities?.[0]?.top_logprobs
      if (top) return top
    } catch (e) {
      last = String(e)
    }
  }
  return undefined
}

const tokenize = async (content: string) => (await post<{ tokens: number[] }>('/tokenize', { content })).tokens

/**
 * log P(text | prefix), summed over the text's tokens. A token outside the top
 * candidates counts as the lowest of them, so `misses` such tokens make the
 * sum an upper bound.
 */
export async function score(prefix: string, text: string): Promise<{ sum: number; tokens: number; misses: number }> {
  const [pre, full] = await Promise.all([tokenize(prefix), tokenize(prefix + text)])
  let k = 0
  while (k < pre.length && pre[k] === full[k]) k++
  let sum = 0
  let misses = 0
  for (let i = k; i < full.length; i++) {
    const top = await step(full.slice(0, i))
    if (!top) throw new Error(`no candidates at token ${i} of ${full.length}: ${JSON.stringify(last).slice(0, 300)}`)
    const hit = top.find((t) => t.id === full[i])
    if (hit) sum += hit.logprob
    else (sum += Math.min(...top.map((t) => t.logprob))), misses++
  }
  return { sum, tokens: full.length - k, misses }
}
