// Tells text typed in Latin letters ("kal meeting hai") from English, and names
// its language, so the app can offer "Typed in Latin letters" for a paste that
// needs it. A character n-gram model (1 to 4 letters, naive Bayes), built by
// bench/detect-typed.ts from sentences typed by native speakers (Dakshina) and
// IN22 sentences written in Latin letters by indickit, with IN22's English as the
// other side. The model is a guess for the owner to confirm: among close
// languages (Hindi and Urdu, Hindi and Maithili) typing does not always tell.

export interface Model {
  version: string
  /** The smallest margin (per letter, against English) that counts as typed Indian text. */
  margin: number
  /** Per language: its most common n-grams joined by newlines, their counts, and all its n-grams' count and kinds. */
  langs: Record<string, { grams: string; counts: number[]; total: number; vocab: number }>
}

export interface Verdict {
  /** The best-scoring Indian language. */
  lang: string
  /** Its lead over English, in nats per letter: below the model's `margin` the text is taken for English. */
  margin: number
}

/** Letters, apostrophes and single spaces, in lower case. */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The character 1- to 4-grams of the normalized text, with a space at each end. */
export function grams(text: string): string[] {
  const s = ` ${normalize(text)} `
  const out: string[] = []
  for (let n = 1; n <= 4; n++) for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n))
  return out
}

/** Prose only: fenced and inline code, addresses and front matter say nothing about the language. */
export const prose = (text: string) =>
  text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\S+@\S+\.\S+/g, ' ')

/** Fewer letters than this, and the text says nothing. */
const MIN_LETTERS = 20

type Compiled = { lang: string; lookup: Map<string, number>; floor: number }[]
const compiled = new WeakMap<Model, Compiled>()
function compile(model: Model): Compiled {
  let c = compiled.get(model)
  if (!c) {
    c = Object.entries(model.langs).map(([lang, m]) => {
      const denominator = m.total + 0.5 * m.vocab
      return { lang, lookup: new Map(m.grams.split('\n').map((g, i) => [g, Math.log((m.counts[i] + 0.5) / denominator)])), floor: Math.log(0.5 / denominator) }
    })
    compiled.set(model, c)
  }
  return c
}

/** Each language's log-likelihood of the text. */
export function scores(model: Model, text: string): Record<string, number> {
  const gs = grams(text)
  const out: Record<string, number> = {}
  for (const { lang, lookup, floor } of compile(model)) {
    let lp = 0
    for (const g of gs) lp += lookup.get(g) ?? floor
    out[lang] = lp
  }
  return out
}

/** True when the text's prose has letters enough to judge, at least four in
 *  five of them Latin. Text in a script, or too little text, says nothing. */
export function mostlyLatin(text: string): boolean {
  const p = prose(text)
  const letters = p.match(/\p{L}/gu)?.length ?? 0
  const latin = p.match(/[A-Za-z]/g)?.length ?? 0
  return letters >= MIN_LETTERS && latin / letters >= 0.8
}

/** The verdict on a text, or null when it is not mostly Latin letters. */
export function detect(model: Model, text: string): Verdict | null {
  if (!mostlyLatin(text)) return null
  const p = prose(text)
  const s = scores(model, p)
  const best = Object.keys(s)
    .filter((l) => l !== 'en')
    .reduce((a, b) => (s[b] > s[a] ? b : a))
  return { lang: best, margin: (s[best] - s.en) / Math.max(1, normalize(p).replace(/ /g, '').length) }
}

/** The language the text looks typed in, or null when it reads as English. */
export function looksTyped(model: Model, text: string): string | null {
  const v = detect(model, text)
  return v && v.margin >= model.margin ? v.lang : null
}

let loaded: Promise<Model> | null = null
/** The shipped model, fetched with the first paste that could need it. */
export function detector(): Promise<Model> {
  loaded ??= import('./typed-detect.json').then((m) => m.default as Model)
  return loaded
}
