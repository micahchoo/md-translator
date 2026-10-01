// Code owns the Markdown. This module finds the spans of a document that hold
// prose, hands the model only those (as plain one-line text with link targets
// masked), and splices the translations back by source offset, so every byte
// it did not hand out survives unchanged.
import type { Heading, Nodes, Paragraph, TableCell, Yaml } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { frontmatter } from 'micromark-extension-frontmatter'
import { gfm } from 'micromark-extension-gfm'

export interface Unit {
  start: number
  end: number
  /** What the model sees: one line, link and wikilink targets masked as `#n`. */
  text: string
  /** Masked targets in order: `#1` is `restore[0]`. */
  restore: string[]
  /** A block is prose in the body; a value is a front matter property value. */
  kind: 'block' | 'value'
  /** The quote a value sat inside, which its translation must be escaped for. */
  quoted?: '"' | "'"
}

export interface SegmentOptions {
  /** Front matter keys whose values are never translated. */
  skipKeys: string[]
}

const WORDS = /\p{L}{2}/u
const CALLOUT = /^\[![\w-]+\][+-]?[ \t]*/
const LINKS_ONLY = /^(?:!?\[\[[^\]]+\]\][ \t]*)+$/
const LINE_PREFIX = /^[ \t]*(?:>[ \t]?)*[ \t]*/
const WIKILINK = /(!?)\[\[([^\]|]+)((?:\|[^\]]*)?)\]\]/g
// A destination may hold one level of parentheses (Wikipedia URLs) and a title.
const DESTINATION = /\]\(((?:[^()\s]|\([^()]*\))*(?:\s+"[^"]*")?)\)/g

export function segment(md: string, opts: SegmentOptions): Unit[] {
  const tree = fromMarkdown(md, {
    extensions: [gfm(), frontmatter(['yaml'])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
  })
  const skip = new Set(opts.skipKeys.map((k) => k.trim().toLowerCase()))
  const units: Unit[] = []
  const visit = (node: Nodes, parent?: Nodes) => {
    if (node.type === 'yaml') return void units.push(...frontMatter(md, node, skip))
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell') {
      const opensQuote = parent?.type === 'blockquote' && parent.children[0] === node
      return void units.push(...prose(md, node, opensQuote))
    }
    if ('children' in node) for (const child of node.children) visit(child, node)
  }
  visit(tree)
  return units
}

/** One block's inline content, split around lines that hold no prose. */
function prose(md: string, node: Paragraph | Heading | TableCell, opensQuote: boolean): Unit[] {
  const kids = node.children
  if (!kids.length) return []
  const from = kids[0].position!.start.offset!
  const to = kids[kids.length - 1].position!.end.offset!
  const units: Unit[] = []
  let run: { start: number; end: number; lines: string[] } | null = null
  const flush = () => {
    if (run) units.push(...block(run.start, run.end, run.lines.join(' ')))
    run = null
  }

  let pos = from
  md.slice(from, to).split('\n').forEach((raw, i) => {
    const lineStart = pos
    pos += raw.length + 1
    const cut = i === 0 ? 0 : raw.match(LINE_PREFIX)![0].length
    let start = lineStart + cut
    let line = raw.slice(cut).replace(/[ \t]+$/, '')
    if (i === 0 && opensQuote && CALLOUT.test(line)) {
      // The title is its own unit; the type marker is never offered.
      const marker = line.match(CALLOUT)![0].length
      units.push(...block(start + marker, start + line.length, line.slice(marker)))
      return
    }
    if (!line.trim() || LINKS_ONLY.test(line.trim())) return flush()
    const lead = line.length - line.trimStart().length
    start += lead
    line = line.trimStart()
    if (run) {
      run.end = start + line.length
      run.lines.push(line)
    } else run = { start, end: start + line.length, lines: [line] }
  })
  flush()
  return units
}

function block(start: number, end: number, raw: string): Unit[] {
  const { text, restore } = mask(raw)
  return hasWords(text) ? [{ start, end, text, restore, kind: 'block' }] : []
}

function hasWords(masked: string): boolean {
  return WORDS.test(masked.replace(/`[^`]*`/g, '').replace(/#\d+/g, ''))
}

/** Property values of the YAML front matter, found line by line so nothing else moves. */
function frontMatter(md: string, node: Yaml, skip: Set<string>): Unit[] {
  const open = node.position!.start.offset!
  const bodyStart = md.indexOf('\n', open) + 1
  const units: Unit[] = []
  let key = ''
  let pos = bodyStart
  for (const line of md.slice(bodyStart, bodyStart + node.value.length).split('\n')) {
    const lineStart = pos
    pos += line.length + 1
    let value: string
    let start: number
    const top = line.match(/^(["']?)([^"':\n]*)\1:(?:[ \t]+(.*))?$/)
    const item = line.match(/^([ \t]+-[ \t]+)(.*)$/)
    if (top && !/^[ \t]/.test(line)) {
      key = top[2].trim().toLowerCase()
      value = top[3] ?? ''
      start = lineStart + line.length - value.length
    } else if (item) {
      value = item[2]
      start = lineStart + item[1].length
    } else continue
    if (skip.has(key)) continue
    value = value.replace(/[ \t]+$/, '')
    let quoted: Unit['quoted']
    const q = value.match(/^(["'])(.*)\1$/)
    if (q) {
      quoted = q[1] as '"' | "'"
      value = q[2]
      start += 1
      const lead = value.length - value.trimStart().length
      start += lead
      value = value.trim()
    } else if (/^[[{|>&*!%@`]/.test(value)) continue // flow, block scalar, anchor, tag
    if (LINKS_ONLY.test(value) || /^(?:true|false|null|yes|no|~)$/i.test(value) || /^\w+:\/\//.test(value)) continue
    const { text, restore } = mask(value)
    if (hasWords(text)) units.push({ start, end: start + value.length, text, restore, kind: 'value', quoted })
  }
  return units
}

export function mask(s: string): { text: string; restore: string[] } {
  const restore: string[] = []
  const keep = (v: string) => restore.push(v)
  const text = s
    .replace(WIKILINK, (_, bang: string, target: string, alias: string) => `${bang}[[#${keep(target)}${alias}]]`)
    .replace(DESTINATION, (_, dest: string) => `](#${keep(dest)})`)
  return { text, restore }
}

export function unmask(s: string, restore: string[]): string {
  const at = (n: string) => restore[Number(n) - 1]
  return s
    .replace(/\[\[#(\d+)/g, (m, n: string) => (at(n) === undefined ? m : `[[${at(n)}`))
    .replace(/\]\(#(\d+)\)/g, (m, n: string) => (at(n) === undefined ? m : `](${at(n)})`))
}

/** Puts each translation back at its unit's offsets. `outputs[i]` belongs to `units[i]`. */
export function assemble(md: string, units: Unit[], outputs: string[]): string {
  const order = units.map((u, i) => [u, outputs[i]] as const).sort((a, b) => b[0].start - a[0].start)
  let out = md
  for (const [u, o] of order) out = out.slice(0, u.start) + writeBack(u, o) + out.slice(u.end)
  return out
}

function writeBack(u: Unit, output: string): string {
  const v = unmask(output, u.restore).replace(/\s*\n\s*/g, ' ').trim()
  if (u.kind === 'block') return v
  if (u.quoted === "'") return v.replace(/'/g, "''")
  const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  if (u.quoted === '"') return escaped
  return /: |:$| #|^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(v) ? `"${escaped}"` : v
}

/**
 * Splits a passage longer than `max` at sentence ends, never inside brackets or
 * inline code. A sentence longer than `max` stays whole: cutting it would hand
 * the model half a thought.
 */
export function splitPassage(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const sentences: string[] = []
  let depth = 0
  let code = false
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '`') code = !code
    if (code) continue
    if (c === '[' || c === '(') depth++
    else if ((c === ']' || c === ')') && depth > 0) depth--
    else if (depth === 0 && /[.!?।॥]/.test(c)) {
      let j = i + 1
      while (j < text.length && /["'”’)]/.test(text[j])) j++
      const gap = text.slice(j).match(/^\s+/)
      if (gap && !/^\p{Ll}/u.test(text.slice(j + gap[0].length))) {
        sentences.push(text.slice(from, j))
        from = j + gap[0].length
        i = from - 1
      }
    }
  }
  sentences.push(text.slice(from))
  const pieces: string[] = []
  for (const s of sentences) {
    const last = pieces.length - 1
    if (last >= 0 && pieces[last].length + 1 + s.length <= max) pieces[last] += ' ' + s
    else pieces.push(s)
  }
  return pieces
}
