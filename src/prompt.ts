// The prompt is parallel text, not a chat. Measured on sarvam-30b, 2026-10-01:
// in chat form the model answered headings ("Covers AI incidents?" → "Yes, it
// covers…") and thinking could not be switched off; as a list of English and
// translation pairs ending in an open line it has no one to reply to and no
// turn to think in. Flagged blocks fell from 22 to 3 of 56 (Hindi).
import type { Language, Pair } from './languages'

export const DEFAULT_PREAMBLE =
  'The following are English passages with faithful, complete {L} translations. ' +
  'Every sentence is translated. Markdown syntax, inline code, numbers and names are kept unchanged.'

/** One block per request: the answer ends at a blank line or a new English line. */
export const STOP = ['\n\n', '\nEnglish:']

export interface PromptInput {
  language: Language
  /** `{L}` is replaced by the language name. */
  preamble: string
  examples: Pair[]
  /** The units just before this one with their translations, oldest first. */
  context: Pair[]
  source: string
}

export function buildPrompt({ language, preamble, examples, context, source }: PromptInput): string {
  const L = language.name
  const pairs = [...examples, ...context].map(([en, t]) => `English: ${en}\n${L}: ${t}\n\n`).join('')
  return `${preamble.replaceAll('{L}', L)}\n\n${pairs}English: ${source}\n${L}:`
}

export function cleanOutput(raw: string, language: Language): string {
  return raw
    .split(/\n\s*\n|\nEnglish:/)[0]
    .trim()
    .replace(new RegExp(`^${language.name}:\\s*`), '')
}
