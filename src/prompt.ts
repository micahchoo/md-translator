// The prompt is parallel text, not a chat. Measured on sarvam-30b, 2026-10-01:
// in chat form the model answered headings ("Covers AI incidents?" → "Yes, it
// covers…") and thinking could not be switched off; as a list of English and
// translation pairs ending in an open line it has no one to reply to and no
// turn to think in. Flagged blocks fell from 22 to 3 of 56 (Hindi).
import type { Language, Pair } from './languages'

export const DEFAULT_PREAMBLE =
  'The following are {S} passages with faithful, complete {L} translations. ' +
  'Every sentence is translated. Markdown syntax, inline code, numbers and names are kept unchanged.'

/** One block per request: the answer ends at a blank line or a new source line. */
export const stopFor = (language: Language) => ['\n\n', `\n${language.from}:`, `\n${language.name}:`]

export interface PromptInput {
  language: Language
  /** `{L}` is replaced by the language name, `{S}` by the source label. */
  preamble: string
  examples: Pair[]
  /** The language the examples are written in, when it is not the target:
   *  another language's examples teach the task's shape, under their own label. */
  exampleLabel?: string
  /** The units just before this one with their translations, oldest first. */
  context: Pair[]
  source: string
  /** The source block after this one, shown as context only. Being measured
   *  (bench/starts.ts `ahead`): a heading's meaning is often settled by what
   *  follows it, but a line outside the pattern may be read as an instruction. */
  ahead?: string
}

export function buildPrompt({ language, preamble, examples, exampleLabel, context, source, ahead }: PromptInput): string {
  const { name: L, from: S } = language
  const pair = (label: string) => ([s, t]: Pair) => `${S}: ${s}\n${label}: ${t}\n\n`
  const pairs = [...examples.map(pair(exampleLabel ?? L)), ...context.map(pair(L))].join('')
  const next = ahead ? `The passage continues after this line: ${ahead}\n\n` : ''
  return `${preamble.replaceAll('{L}', L).replaceAll('{S}', S)}\n\n${next}${pairs}${S}: ${source}\n${L}:`
}

export function cleanOutput(raw: string, language: Language): string {
  return raw
    .split(new RegExp(`\\n\\s*\\n|\\n${language.from}:|\\n${language.name}:`))[0]
    .trim()
    .replace(new RegExp(`^${language.name}:\\s*`), '')
}
