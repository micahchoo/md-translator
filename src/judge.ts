// The model as its own judge: how likely it finds an answer under the prompt
// that made it, against the same prompt with one thing swapped. The rules see
// letters, numbers and length; these two see what they cannot.
//
//   lost negation     the English source with and without its "not"
//   other language    the language label against its related languages
//
// Measured on sarvam-30b's own answers (bench/judge-own.ts, 2026-10-04): 103 of
// 109 lost negations caught at 8 false alarms in 105, and 103 of 105 related-
// language answers caught at 1 in 58. Kannada and Malayalam had 3 false alarms
// in 14 each for negation, so they are left out of that check.
//
// Scoring needs llama.cpp's own /tokenize and /completion with n_probs. On any
// other server `probe` says no, and the app does not judge.
import type { Flag } from './checks'
import { LANGUAGES, type Language, type Pair } from './languages'
import { addressSpace } from './llm'
import { buildPrompt } from './prompt'

/** log P(text | prefix), summed over the text's tokens. */
export type Score = (prefix: string, text: string, signal?: AbortSignal) => Promise<number>

// Straight and curly apostrophes: Google Translate writes "didn’t"; read as
// straight only, a kept negation once looked dropped.
export const NEGATION = /\b(?:not|never|no)\b|n['’]t\b/i

/** The sentence with its negation taken out, or null when it has none to take. */
export function dropNegation(s: string): string | null {
  const out = s
    .replace(/\bcan['’]t\b/gi, 'can')
    .replace(/\bwon['’]t\b/gi, 'will')
    .replace(/\b(\w+)n['’]t\b/gi, '$1')
    .replace(/\s+not\b/gi, '')
    .replace(/\bnever\s+/gi, '')
  return out !== s && !NEGATION.test(out) ? out : null
}

/** Languages whose negation check had too many false alarms to use. */
export const NO_NEGATION_CHECK = new Set(['kn', 'ml'])

/** Each language and the related ones it was measured against, by code. Only measured pairs. */
export const RELATED: Record<string, string[]> = { hi: ['mr', 'ne'], mr: ['hi', 'ne'], ne: ['hi', 'mr'], as: ['bn'], bn: ['as'] }

/** True when the answer is likelier after the source without its negation: the "not" is gone. */
export async function lostNegation(score: Score, withNot: string, without: string, output: string, signal?: AbortSignal): Promise<boolean> {
  const kept = await score(withNot, ` ${output}`, signal)
  const lost = await score(without, ` ${output}`, signal)
  return lost > kept
}

/** The label, other than the target's, under which the answer is likeliest, or null when the target's wins. */
export async function otherLanguage(score: Score, prompts: Record<string, string>, target: string, output: string, signal?: AbortSignal): Promise<string | null> {
  let best = target
  let top = -Infinity
  for (const [label, prefix] of Object.entries(prompts)) {
    const s = await score(prefix, ` ${output}`, signal)
    if (s > top) (top = s), (best = label)
  }
  return best === target ? null : best
}

const TOP = 100

/** A scorer for a llama.cpp server, which reads probabilities one token at a time. */
export function createScorer(endpoint: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): Score {
  const base = endpoint.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  const space = addressSpace(endpoint)
  const post = async <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => {
    const r = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      ...(space ? { targetAddressSpace: space } : {}),
    } as RequestInit)
    if (!r.ok) throw new Error(`${path} ${r.status}`)
    return r.json() as Promise<T>
  }
  type Candidates = { id: number; logprob: number }[]
  // One token fails when the likeliest next token is part of a multi-byte letter
  // (the server holds it back); several fail when one is a special token the
  // server's output check refuses. Only the first token's candidates are read.
  const step = async (prompt: number[], signal?: AbortSignal): Promise<Candidates | undefined> => {
    for (const n_predict of [4, 1, 2, 3]) {
      try {
        const res = await post<{ completion_probabilities?: { top_logprobs: Candidates }[] }>(
          '/completion',
          { prompt, n_predict, n_probs: TOP, temperature: 0, cache_prompt: true, ignore_eos: true },
          signal,
        )
        const top = res.completion_probabilities?.[0]?.top_logprobs
        if (top) return top
      } catch (e) {
        if (signal?.aborted) throw e
      }
    }
    return undefined
  }
  return async (prefix, text, signal) => {
    const tokenize = async (content: string) => (await post<{ tokens: number[] }>('/tokenize', { content }, signal)).tokens
    const [pre, full] = await Promise.all([tokenize(prefix), tokenize(prefix + text)])
    let k = 0
    while (k < pre.length && pre[k] === full[k]) k++
    let sum = 0
    for (let i = k; i < full.length; i++) {
      const top = await step(full.slice(0, i), signal)
      if (!top) throw new Error('the server gave no candidates')
      const hit = top.find((t) => t.id === full[i])
      sum += hit ? hit.logprob : Math.min(...top.map((t) => t.logprob))
    }
    return sum
  }
}

/** Whether this server can score text: llama.cpp's /tokenize answers. */
export async function probe(endpoint: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<boolean> {
  try {
    const base = endpoint.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
    const space = addressSpace(endpoint)
    const r = await fetchImpl(`${base}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'a' }),
      ...(space ? { targetAddressSpace: space } : {}),
    } as RequestInit)
    return r.ok && Array.isArray((await r.json())?.tokens)
  } catch {
    return false
  }
}

export interface JudgeInput {
  score: Score
  language: Language
  preamble: string
  examples: Pair[]
  source: string
  output: string
  /** The related-language check is costly; it runs on a document's first few blocks. */
  checkLanguage: boolean
  signal?: AbortSignal
}

/**
 * The flags the judge raises for one clean block, built from the same prompts
 * the measurements used: the language's examples for negation, none for the
 * language label. A scorer that fails raises nothing; a stop is passed on.
 */
export async function judgeAnswer(j: JudgeInput): Promise<Flag[]> {
  const flags: Flag[] = []
  const prompt = (label: string, source: string, examples: Pair[]) =>
    buildPrompt({ language: { ...j.language, name: label }, preamble: j.preamble, examples, context: [], source })
  try {
    const changed = j.language.from === 'English' && !NO_NEGATION_CHECK.has(j.language.code) ? dropNegation(j.source) : null
    if (changed && (await lostNegation(j.score, prompt(j.language.name, j.source, j.examples), prompt(j.language.name, changed, j.examples), j.output, j.signal)))
      flags.push('meaning')
    const related = RELATED[j.language.code]
    if (j.checkLanguage && related) {
      const labels = [j.language.name, ...related.map((c) => LANGUAGES[c].name)]
      const prompts = Object.fromEntries(labels.map((l) => [l, prompt(l, j.source, [])]))
      if (await otherLanguage(j.score, prompts, j.language.name, j.output, j.signal)) flags.push('language')
    }
  } catch (e) {
    if (j.signal?.aborted) throw e
  }
  return flags
}
