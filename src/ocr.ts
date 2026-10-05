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
import { detect, readingOrder, type Region } from './layout'

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
  paragraphs: {
    bbox: { x0: number; y0: number; x1: number; y1: number }
    lines: { text: string; bbox: { x0: number; x1: number }; words: { text: string; confidence: number }[] }[]
  }[]
}

/** The Tesseract models for an image in `code`, with English's when it also has English. */
export function models(code: string, english: boolean): string {
  const model = LANGUAGES[code].ocr!.model
  return english && model !== 'eng' ? `${model}+eng` : model
}

/** The languages an image may be read in: those with a model that passed. */
export const imageLanguages = () => Object.values(LANGUAGES).filter((l) => l.ocr)

/**
 * The language of an image's or a PDF's text. Into an Indian language the
 * source is English; into English it is the owner's choice, since Tesseract
 * must know the script before it reads. A PDF may be in any language, since
 * its text layer needs no reading; an image only in one that can be read.
 */
export function imageLanguage(target: string, chosen: string, pdf = false): string {
  if (target !== 'en') return 'en'
  const ok = pdf ? chosen in LANGUAGES && chosen !== 'en' : !!LANGUAGES[chosen]?.ocr
  return ok ? chosen : 'hi'
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

/** A paragraph's lines, joined. */
const joined = (p: ReadBlock['paragraphs'][number]) => p.lines.map((l) => l.text.replace(/\s+/g, ' ').trim()).filter(Boolean).reduce(joinLine, '')

/** A layout region read on its own: one paragraph, however Tesseract split it. */
export function regionText(blocks: ReadBlock[]): string {
  return escapeMarkdown(blocks.flatMap((b) => b.paragraphs.filter(isText).map(joined)).filter(Boolean).reduce(joinLine, ''))
}

/** What the regions left, as Tesseract's paragraphs with their boxes, to be put in reading order. */
export function paragraphRegions(blocks: ReadBlock[]): Region[] {
  return blocks.flatMap((b) =>
    b.paragraphs.filter(isText).flatMap((p) => {
      const text = joined(p)
      return text ? [{ box: [p.bbox.x0, p.bbox.y0, p.bbox.x1, p.bbox.y1] as Region['box'], text: escapeMarkdown(text) }] : []
    }),
  )
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

/** Readings on one worker run one after another: a reading changes the
 *  worker's page mode, and two at once would change it under each other. */
const queues = new Map<string, Promise<unknown>>()
function queued<T>(model: string, job: () => Promise<T>): Promise<T> {
  const next = (queues.get(model) ?? Promise.resolve()).then(job, job)
  queues.set(model, next.catch(() => {}))
  return next
}

/** Pixels around a region, so a letter's marks above and below the line are not cut. */
const MARGIN = 24

/**
 * An image read in the language `code`, with English as well when `english`.
 * Where the layout model finds a picture the page is designed, and each of its
 * text regions is read on its own, then whatever they left; otherwise
 * Tesseract's own layout reads the whole page. `onStatus` hears the progress.
 */
export async function readImage(image: Blob, code: string, english: boolean, onStatus?: (status: string) => void): Promise<string> {
  if (!LANGUAGES[code]?.ocr) throw new Error(`${LANGUAGES[code]?.name ?? code} cannot be read from images.`)
  const model = models(code, english)
  const bitmap = await createImageBitmap(image)
  onStatus?.('finding the layout')
  // Layout only improves a reading; if it cannot load, the page is read without it.
  const layout = await detect(bitmap).catch((e) => (console.warn('No layout:', e), { text: [], pictures: 0 }))
  return queued(model, async () => {
    if (onStatus) listeners.set(model, onStatus)
    const w = await worker(model)
    const { PSM } = await import('tesseract.js')
    try {
      if (!layout.pictures || !layout.text.length) {
        const { data } = await w.recognize(image, {}, { blocks: true, text: false })
        return pageText((data.blocks ?? []) as ReadBlock[])
      }
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      for (const r of layout.text) {
        const [x1, y1, x2, y2] = r.box
        const left = Math.max(0, Math.floor(x1 - MARGIN))
        const top = Math.max(0, Math.floor(y1 - MARGIN))
        const rectangle = { left, top, width: Math.min(bitmap.width, Math.ceil(x2 + MARGIN)) - left, height: Math.min(bitmap.height, Math.ceil(y2 + MARGIN)) - top }
        const { data } = await w.recognize(image, { rectangle }, { blocks: true, text: false })
        r.text = regionText((data.blocks ?? []) as ReadBlock[])
      }
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
      // Tesseract's own layout on what the regions left: text the model missed is still read.
      const rest = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = rest.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      ctx.fillStyle = '#fff'
      for (const { box: [x1, y1, x2, y2] } of layout.text) ctx.fillRect(x1 - 4, y1 - 4, x2 - x1 + 8, y2 - y1 + 8)
      const { data } = await w.recognize(await rest.convertToBlob({ type: 'image/png' }), {}, { blocks: true, text: false })
      const regions = [...layout.text, ...paragraphRegions((data.blocks ?? []) as ReadBlock[])]
      return readingOrder(regions).map((r) => r.text).filter(Boolean).join('\n\n')
    } finally {
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO }).catch(() => {})
      listeners.delete(model)
    }
  })
}
