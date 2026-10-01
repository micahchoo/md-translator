// Settings live in this browser's localStorage. Storage can be empty, corrupt
// or blocked (private window); every failure falls back to the defaults.
import { LANGUAGES, type Pair } from './languages'
import { DEFAULT_PREAMBLE } from './prompt'
import type { TranslateOptions } from './translate'

export interface Settings {
  endpoint: string
  model: string
  language: string
  passageLength: number
  contextBlocks: number
  retries: number
  /** The system prompt: `{L}` becomes the language name. */
  preamble: string
  /** Examples per language code. */
  examples: Record<string, Pair[]>
  /** Comma-separated front matter keys whose values are never translated. */
  skipKeys: string
}

export const DEFAULTS: Settings = {
  endpoint: 'http://localhost:8086',
  model: 'sarvam-30b',
  language: 'hi',
  passageLength: 1200,
  contextBlocks: 2,
  retries: 3,
  preamble: DEFAULT_PREAMBLE,
  examples: Object.fromEntries(Object.values(LANGUAGES).map((l) => [l.code, l.examples])),
  skipKeys: 'notion-id, base, tags, aliases, cssclasses',
}

const KEY = 'md-translator.settings'

export function loadSettings(storage: Pick<Storage, 'getItem'>): Settings {
  let stored: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '{}')
    if (parsed && typeof parsed === 'object') stored = parsed
  } catch {
    return structuredClone(DEFAULTS)
  }
  const out = structuredClone(DEFAULTS)
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = stored[key]
    if (v === undefined || typeof v !== typeof DEFAULTS[key]) continue
    if (typeof v === 'number' && !(Number.isFinite(v) && v >= 0)) continue
    if (key === 'language' && !(v as string in LANGUAGES)) continue
    if (key === 'examples') {
      for (const [code, pairs] of Object.entries(v as Record<string, unknown>))
        if (code in LANGUAGES && Array.isArray(pairs)) out.examples[code] = pairs as Pair[]
      continue
    }
    ;(out as unknown as Record<string, unknown>)[key] = v
  }
  return out
}

export function saveSettings(storage: Pick<Storage, 'setItem'>, s: Settings): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export function formatExamples(pairs: Pair[], name: string): string {
  return pairs.map(([en, t]) => `English: ${en}\n${name}: ${t}`).join('\n\n')
}

export function parseExamples(text: string, name: string): Pair[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return blocks.map((b, i) => {
    const en = b.match(/^English:\s*(.+)$/m)?.[1]?.trim()
    const t = b.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim()
    if (!en || !t) throw new Error(`Example ${i + 1} needs one "English:" line and one "${name}:" line.`)
    return [en, t] as Pair
  })
}

export function toOptions(s: Settings): TranslateOptions {
  const language = LANGUAGES[s.language] ?? LANGUAGES.hi
  return {
    language,
    preamble: s.preamble,
    examples: s.examples[language.code] ?? language.examples,
    contextBlocks: s.contextBlocks,
    passageLength: s.passageLength,
    retries: s.retries,
    skipKeys: s.skipKeys.split(',').map((k) => k.trim()).filter(Boolean),
  }
}
