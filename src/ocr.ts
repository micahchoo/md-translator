// An attached image read into Markdown, in the page. Tesseract.js reads it with
// the language's tessdata_fast model, and what it read becomes the document's
// source: the owner checks it there, and from Translate on nothing is new.
//
// bench/ocr.ts chose all of this; see "Reading images" in bench/README.md. The
// models load from one commit of tessdata_fast, so a file can never change under
// us, and the bench reads exactly these files. Sauvola thresholding, because one
// global threshold read 98 characters of a grey page's 1,584. Automatic page
// layout, because Tesseract's API otherwise reads a page as one block, straight
// across its columns. The language's model alone unless the owner says the
// image also has English: on one-language books adding English's lowered
// almost every language, and on a brochure without it the English is garbage.
//
// Tesseract.js loads on the first image, never with the page: its engine is
// 3.9 MB and each model 1 to 5 MB. Tesseract.js keeps the models in IndexedDB.
import { LANGUAGES } from './languages'

export const TESSDATA_COMMIT = '87416418657359cb625c412a48b6e1d6d41c29bd'
const LANG_PATH = `https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@${TESSDATA_COMMIT}`
// One engine file, bundled with the page: SIMD and LSTM only, which every
// browser that runs this page supports.
const CORE = new URL('../node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', import.meta.url)
const WORKER = new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url)

/** A paragraph with no word Tesseract was at least this sure of is dropped. */
const SURE = 60

/** The part of Tesseract's output read here, so tests need no Tesseract. */
export interface ReadBlock {
  paragraphs: { lines: { text: string; bbox: { x0: number; x1: number }; words: { text: string; confidence: number }[] }[] }[]
}

/** The Tesseract models for an image in `code`, with English's when it also has English. */
export function models(code: string, english: boolean): string {
  const model = LANGUAGES[code].ocr!.model
  return english && model !== 'eng' ? `${model}+eng` : model
}

/** The languages an image may be read in: those with a model that passed. */
export const imageLanguages = () => Object.values(LANGUAGES).filter((l) => l.ocr)

/**
 * The language of an image's text. Into an Indian language the source is
 * English; into English it is the owner's choice, since Tesseract must know
 * the script before it reads.
 */
export function imageLanguage(target: string, chosen: string): string {
  if (target !== 'en') return 'en'
  return LANGUAGES[chosen]?.ocr ? chosen : 'hi'
}

/** Characters that would turn read text into Markdown it never was. */
export function escapeMarkdown(line: string): string {
  return line
    .replace(/([\\`*_[\]<])/g, '\\$1')
    .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s)/, '$1\\$2')
}

/**
 * A paragraph so far with its next line. A Latin word broken by a hyphen at a
 * line's end is joined again; any other hyphen at a line's end is kept,
 * without a space, since it joined two words in print.
 */
export function joinLine(text: string, line: string): string {
  if (!text) return line
  if (/[a-z]-$/.test(text) && /^[a-z]/.test(line)) return text.slice(0, -1) + line
  if (text.endsWith('-')) return text + line
  return text + ' ' + line
}

/** A line this much narrower than its paragraph's widest one ends where it ends. */
const SHORT = 0.7

/**
 * Lines joined into paragraphs, a blank line between paragraphs. Tesseract
 * calls a whole column one paragraph, so its widths decide: in prose most
 * lines run the full width and only a short one ends a paragraph; where fewer
 * than half do (an index, a list, a poem) every line stands alone.
 */
export function pageText(blocks: ReadBlock[]): string {
  const paras: string[] = []
  for (const b of blocks)
    for (const p of b.paragraphs.filter(isText)) {
      const lines = p.lines
        .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), width: l.bbox.x1 - l.bbox.x0 }))
        .filter((l) => l.text)
      const widest = Math.max(0, ...lines.map((l) => l.width))
      const full = (l: { width: number }) => l.width >= SHORT * widest
      const prose = lines.filter(full).length * 2 >= lines.length
      let text = ''
      for (const l of lines) {
        text = joinLine(text, l.text)
        if (!prose || !full(l)) {
          paras.push(escapeMarkdown(text))
          text = ''
        }
      }
      if (text) paras.push(escapeMarkdown(text))
    }
  return paras.join('\n\n')
}

/** A paragraph with no word Tesseract was sure of is a graphic read as
 *  letters: a brochure's arrows came back as ಸ, ಠ್‌, ನ. It is left out. */
function isText(p: ReadBlock['paragraphs'][number]): boolean {
  return p.lines.some((l) => l.words.some((w) => w.confidence >= SURE))
}

// ---- reading, in the browser ----------------------------------------------

type Worker = import('tesseract.js').Worker
const workers = new Map<string, Promise<Worker>>()
/** What the worker of each model is doing, for the status line. */
const listeners = new Map<string, (status: string) => void>()

function worker(model: string): Promise<Worker> {
  let w = workers.get(model)
  if (!w) {
    w = (async () => {
      const { createWorker } = await import('tesseract.js')
      const created = await createWorker(model, 1, {
        langPath: LANG_PATH,
        gzip: false,
        corePath: CORE.href,
        workerPath: WORKER.href,
        logger: (m) => listeners.get(model)?.(m.status),
      })
      // Tesseract's API reads a page as one block unless told otherwise, straight
      // across its columns; its command line asks for automatic layout, and so do we.
      await created.setParameters({ thresholding_method: '2', tessedit_pageseg_mode: '3' } as Record<string, string>)
      return created
    })()
    // A failed load is not kept: the next image tries again.
    w.catch(() => workers.delete(model))
    workers.set(model, w)
  }
  return w
}

/** An image read in the language `code`, with English as well when `english`.
 *  `onStatus` hears Tesseract's progress. */
export async function readImage(image: Blob, code: string, english: boolean, onStatus?: (status: string) => void): Promise<string> {
  if (!LANGUAGES[code]?.ocr) throw new Error(`${LANGUAGES[code]?.name ?? code} cannot be read from images.`)
  const model = models(code, english)
  if (onStatus) listeners.set(model, onStatus)
  try {
    const { data } = await (await worker(model)).recognize(image, {}, { blocks: true, text: false })
    const blocks = (data.blocks ?? []) as ReadBlock[]
    return pageText(blocks)
  } finally {
    listeners.delete(model)
  }
}
