// Settings live in this browser's localStorage. Storage can be empty, corrupt
// or blocked (private window); every failure falls back to the defaults.
import { LANGUAGES, type Language, type Pair } from './languages'
import { DEFAULT_PREAMBLE } from './prompt'
import type { TranslateOptions } from './translate'

export interface Settings {
  endpoint: string
  model: string
  language: string
  passageLength: number
  contextBlocks: number
  retries: number
  /** The system prompt: `{L}` becomes the language name, `{S}` the source label. */
  preamble: string
  /** Examples per language code. */
  examples: Record<string, Pair[]>
  /** Comma-separated front matter keys whose values are never translated. */
  skipKeys: string
  /** Downloads end with a line saying a model made the translation. */
  noteOnDownload: boolean
  /** The model judges its own answers for a lost "not" and a related language (src/judge.ts). */
  judge: boolean
  /** The language an image or a PDF is read in when translating into English (src/ocr.ts). */
  imageLanguage: string
  /** Images are read for English as well as their own language. */
  imageEnglish: boolean
  /** Translations in Blocks show a line in Latin letters (src/latin.ts). */
  latin: boolean
  /** Which one-time corrections the saved settings have had; see `loadSettings`. */
  revision: number
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
  noteOnDownload: true,
  judge: false,
  imageLanguage: 'hi',
  imageEnglish: false,
  latin: false,
  revision: 1,
}

const KEY = 'md-translator.settings'

/** The default until 2026-10-03, when the source could only be English. Saved
 *  untouched, it would tell the model an Original passage is English. */
const ENGLISH_ONLY_PREAMBLE =
  'The following are English passages with faithful, complete {L} translations. ' +
  'Every sentence is translated. Markdown syntax, inline code, numbers and names are kept unchanged.'

/** Revision 1, 2026-10-04: the judge became off by default. Every save stores
 *  every setting, so a judge saved on before then was mostly the old default,
 *  not a choice. It is turned off once; saved again, it carries revision 1. */
const JUDGE_OFF = 1

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
    if (key === 'imageLanguage' && !(v as string in LANGUAGES)) continue
    if (key === 'examples') {
      for (const [code, pairs] of Object.entries(v as Record<string, unknown>))
        if (code in LANGUAGES && Array.isArray(pairs)) out.examples[code] = pairs as Pair[]
      continue
    }
    if (key === 'preamble' && v === ENGLISH_ONLY_PREAMBLE) continue
    if (key === 'judge' && !(typeof stored.revision === 'number' && stored.revision >= JUDGE_OFF)) continue
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

export function formatExamples(pairs: Pair[], { from, name }: Language): string {
  return pairs.map(([s, t]) => `${from}: ${s}\n${name}: ${t}`).join('\n\n')
}

export function parseExamples(text: string, { from, name }: Language): Pair[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const line = (b: string, label: string) => b.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  return blocks.map((b, i) => {
    const s = line(b, from)
    const t = line(b, name)
    if (!s || !t) throw new Error(`Example ${i + 1} needs one "${from}:" line and one "${name}:" line.`)
    return [s, t] as Pair
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
