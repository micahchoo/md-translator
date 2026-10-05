// A PDF's text, page by page. Where a page's text layer is sound it is used as
// it is, exact and at once. Where the page has none (a scan), or its letters
// are not the expected script (a legacy font: Krutidev Hindi is Latin letters
// standing for Devanagari), or it breaks the rules of Indic syllables (an
// InDesign handout gave திறன்மிகு as தி்றன்்மிகு), the page is drawn and read
// like an attached image. A language that cannot be read from images keeps its
// damaged layer, and the page says so.
//
// pdf.js loads on the first PDF, never with the page.
import { LANGUAGES } from './languages'
import { escapeMarkdown, joinLine, readImage } from './ocr'

export interface LayerItem {
  str: string
  hasEOL: boolean
  /** pdf.js's text matrix; [4] and [5] are x and y, y counting up from the page's foot. */
  transform: number[]
  height: number
}

/** A gap between two lines wider than this many lines starts a paragraph. */
const PARAGRAPH_GAP = 1.5

/**
 * Lines from pdf.js's text items, joined into paragraphs. A paragraph ends
 * where the next line is further down than a line and a half, or back up the
 * page, which is a new column or a new box.
 */
export function layerText(items: LayerItem[]): string {
  const lines: { text: string; y: number; h: number }[] = []
  let cur: { text: string; y: number; h: number } | null = null
  for (const it of items) {
    if (it.str) {
      cur ??= { text: '', y: it.transform[5], h: 0 }
      cur.text += it.str
      cur.h = Math.max(cur.h, it.height)
    }
    if (it.hasEOL && cur) {
      lines.push(cur)
      cur = null
    }
  }
  if (cur) lines.push(cur)
  const paras: string[] = []
  let text = ''
  let prev: { y: number; h: number } | null = null
  for (const l of lines) {
    const line = l.text.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const gap = prev ? prev.y - l.y : 0
    if (prev && (gap < 0 || gap > PARAGRAPH_GAP * Math.max(prev.h, l.h, 1))) {
      paras.push(escapeMarkdown(text))
      text = ''
    }
    text = joinLine(text, line)
    prev = l
  }
  if (text) paras.push(escapeMarkdown(text))
  return paras.join('\n\n')
}

// Every Indic block from Devanagari to Malayalam lays its marks out alike: the
// dependent vowel signs from 0x3E to 0x4C past the block's start, the virama at
// 0x4D, and the other marks (candrabindu, anusvara, visarga, nukta) around them.
const INDIC_FIRST = 0x0900
const INDIC_LAST = 0x0d7f
const offset = (cp: number) => (cp >= INDIC_FIRST && cp <= INDIC_LAST ? (cp - INDIC_FIRST) % 0x80 : -1)
const isVirama = (cp: number) => offset(cp) === 0x4d
const isVowelSign = (cp: number) => offset(cp) >= 0x3e && offset(cp) <= 0x4c
const isMark = (ch: string) => /\p{M}/u.test(ch)
const isLetter = (ch: string) => /\p{L}/u.test(ch)

/**
 * Breaks of the Indic syllable rules, per letter of the text: a virama after a
 * virama or a vowel sign, a vowel sign after a virama or itself, and a mark
 * that starts a word. People do not write these; a damaged text layer does.
 */
export function damage(text: string): number {
  const chars = [...text]
  let breaks = 0
  let letters = 0
  chars.forEach((ch, i) => {
    if (isLetter(ch) || isMark(ch)) letters++
    const cp = ch.codePointAt(0)!
    const before = i ? chars[i - 1] : ' '
    const b = before.codePointAt(0)!
    if (offset(cp) < 0) return
    if (isVirama(cp) && (isVirama(b) || isVowelSign(b))) breaks++
    else if (isVowelSign(cp) && (isVirama(b) || b === cp)) breaks++
    else if (isMark(ch) && !isLetter(before) && !isMark(before)) breaks++
  })
  return letters ? breaks / letters : 0
}

/** More syllable-rule breaks per letter than this, and a layer is damaged. */
const DAMAGED_ABOVE = 0.01
/** Fewer letters than this, and a page has no text worth the name: a scan. */
const FEW_LETTERS = 20

export type PageVerdict = 'layer' | 'empty' | 'script' | 'damaged'

/** Whether a page's text layer can be used as it is, and if not, why. */
export function pageVerdict(text: string, code: string): PageVerdict {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  if (letters < FEW_LETTERS) return 'empty'
  const own = text.match(new RegExp(LANGUAGES[code].script.source, 'g'))?.length ?? 0
  if (own / letters < 0.5) return 'script'
  return damage(text) > DAMAGED_ABOVE ? 'damaged' : 'layer'
}

// ---- reading, in the browser ----------------------------------------------

const PDFJS_VERSION = '6.4.299'
const WORKER = new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)
/** Pages are drawn at this many pixels per point for reading: about 200 dpi. */
const SCALE = 2.8

export interface PdfReading {
  text: string
  pages: number
  /** Pages drawn and read, because their text layer could not be used. */
  read: number
  /** Pages whose damaged layer was kept, because the language cannot be read from images. */
  damaged: number
}

/** A PDF's text in the language `code`, page by page; `onStatus` hears where it is. */
export async function readPdf(file: Blob, code: string, english: boolean, onStatus?: (status: string) => void): Promise<PdfReading> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER.href
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // Fonts a PDF names but does not carry; needed only to draw such a page.
    standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
  })
  const pdf = await task.promise
  const canRead = !!LANGUAGES[code].ocr
  const out: string[] = []
  let read = 0
  let damaged = 0
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      onStatus?.(`Reading page ${n} of ${pdf.numPages}…`)
      const page = await pdf.getPage(n)
      const items = (await page.getTextContent()).items.flatMap((i) => ('str' in i ? [{ str: i.str, hasEOL: i.hasEOL, transform: i.transform, height: i.height }] : []))
      const layer = layerText(items)
      const verdict = pageVerdict(layer, code)
      if (verdict === 'layer') out.push(layer)
      else if (canRead) {
        const viewport = page.getViewport({ scale: SCALE })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await page.render({ canvas, viewport }).promise
        const image = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('The page could not be drawn.'))), 'image/png'))
        out.push(await readImage(image, code, english, (s) => onStatus?.(`Page ${n} of ${pdf.numPages}: ${s.startsWith('recognizing') ? 'reading the image' : 'getting letters'}…`)))
        read++
      } else if (layer) {
        out.push(layer)
        if (verdict !== 'empty') damaged++
      }
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
  return { text: out.filter(Boolean).join('\n\n'), pages: pdf.numPages, read, damaged }
}
