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
import { cropAround, detect, inside, joinLines, readingOrder, type Region } from './layout'

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
    lines: { text: string; bbox: { x0: number; x1: number; y0: number; y1: number }; words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[]
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

/** A layout region read on its own, keeping Tesseract's paragraph breaks: a
 *  heading the model took in with its paragraph stays a heading. */
export function regionText(blocks: ReadBlock[]): string {
  return blocks.flatMap((b) => b.paragraphs.filter(isText).map(joined)).filter(Boolean).map(escapeMarkdown).join('\n\n')
}

/** A paragraph's mean word confidence. */
function meanConfidence(p: ReadBlock['paragraphs'][number]): number {
  const words = p.lines.flatMap((l) => l.words)
  return words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : 0
}

/**
 * Only the words at least half inside `box`; a line's text is its words again.
 * A region's margin is there for the marks above and below its lines, and must
 * not add words of its own: a caption's margin read the photograph beside it.
 */
export function wordsWithin(blocks: ReadBlock[], box: Region['box']): ReadBlock[] {
  return blocks.map((b) => ({
    paragraphs: b.paragraphs
      .map((p) => ({
        ...p,
        lines: p.lines
          .map((l) => {
            const words = l.words.filter((w) => inside([w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1], box) >= 0.5)
            return { ...l, words, text: words.map((w) => w.text).join(' ') }
          })
          .filter((l) => l.words.length),
      }))
      .filter((p) => p.lines.length),
  }))
}

/** The median height of the lines read, in pixels; 0 when none were. */
export function lineHeight(blocks: ReadBlock[]): number {
  const h = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => l.bbox.y1 - l.bbox.y0))).sort((a, b) => a - b)
  return h.length ? h[Math.floor(h.length / 2)] : 0
}

/** Tesseract's paragraphs with their boxes, to be put in reading order: those
 *  with a sure word and, where asked, a mean confidence of at least `minMean`. */
export function paragraphRegions(blocks: ReadBlock[], minMean = 0): Region[] {
  return blocks.flatMap((b) =>
    b.paragraphs.filter((p) => isText(p) && meanConfidence(p) >= minMean).flatMap((p) => {
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

/** The line height Tesseract reads best at, roughly. A region whose lines are
 *  much shorter, as a screenshot's are, is read again enlarged to it: a
 *  brochure's 15 came back as (5 at 20 pixels a line and right at 36. */
const LINE = 36
/** Where the model saw no text, Tesseract must be at least this sure on the whole. */
const REST_MEAN = 60

/**
 * A part of the page read again enlarged, when its lines came back much
 * shorter than LINE; boxes are given back in the page's own pixels.
 */
async function enlarged(w: Worker, page: ImageBitmap, part: { left: number; top: number; width: number; height: number }, blocks: ReadBlock[]): Promise<ReadBlock[]> {
  const h = lineHeight(blocks)
  if (!h || h >= LINE * 0.75) return blocks
  const f = Math.min(3, LINE / h)
  const canvas = new OffscreenCanvas(Math.round(part.width * f), Math.round(part.height * f))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(page, part.left, part.top, part.width, part.height, 0, 0, canvas.width, canvas.height)
  const read = ((await w.recognize(await canvas.convertToBlob({ type: 'image/png' }), {}, { blocks: true, text: false })).data.blocks ?? []) as ReadBlock[]
  const back = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: part.left + b.x0 / f, y0: part.top + b.y0 / f, x1: part.left + b.x1 / f, y1: part.top + b.y1 / f })
  return read.map((b) => ({
    paragraphs: b.paragraphs.map((p) => ({ ...p, bbox: back(p.bbox), lines: p.lines.map((l) => ({ ...l, bbox: back(l.bbox), words: l.words.map((w) => ({ ...w, bbox: back(w.bbox) })) })) })),
  }))
}

/**
 * An image read in the language `code`, with English as well when `english`.
 * The layout model finds the page's text regions and each is read on its own,
 * then whatever they left; where it finds none, or cannot load, Tesseract's
 * own layout reads the whole page. `onStatus` hears the progress.
 */
export async function readImage(image: Blob, code: string, english: boolean, onStatus?: (status: string) => void): Promise<string> {
  if (!LANGUAGES[code]?.ocr) throw new Error(`${LANGUAGES[code]?.name ?? code} cannot be read from images.`)
  const model = models(code, english)
  const bitmap = await createImageBitmap(image)
  onStatus?.('finding the layout')
  // Layout only improves a reading; if it cannot load, the page is read without it.
  const regions: (Region & { h?: number })[] = await detect(bitmap).catch((e): Region[] => (console.warn('No layout:', e), []))
  return queued(model, async () => {
    if (onStatus) listeners.set(model, onStatus)
    const w = await worker(model)
    const { PSM } = await import('tesseract.js')
    try {
      if (!regions.length) {
        const { data } = await w.recognize(image, {}, { blocks: true, text: false })
        return pageText((data.blocks ?? []) as ReadBlock[])
      }
      // A region has one background, where one threshold for all of it is
      // steadier than Sauvola's local ones: on a brochure's green boxes Sauvola
      // dropped whole lines at some sizes, and Otsu read every box at every size.
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, thresholding_method: '0' } as Record<string, string>)
      for (const r of regions) {
        const [x1, y1, x2, y2] = cropAround(r, regions, bitmap.width, bitmap.height)
        const rectangle = { left: Math.floor(x1), top: Math.floor(y1), width: Math.ceil(x2) - Math.floor(x1), height: Math.ceil(y2) - Math.floor(y1) }
        let blocks = (await w.recognize(image, { rectangle }, { blocks: true, text: false })).data.blocks as ReadBlock[] | null
        blocks = await enlarged(w, bitmap, rectangle, blocks ?? [])
        r.h = lineHeight(blocks)
        r.text = regionText(wordsWithin(blocks, r.box))
      }
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, thresholding_method: '2' } as Record<string, string>)
      // Tesseract's own layout on what the regions left: text the model missed is still read.
      const rest = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = rest.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      ctx.fillStyle = '#fff'
      for (const { box: [x1, y1, x2, y2] } of regions) ctx.fillRect(x1 - 4, y1 - 4, x2 - x1 + 8, y2 - y1 + 8)
      const page = { left: 0, top: 0, width: bitmap.width, height: bitmap.height }
      const restBitmap = await createImageBitmap(rest)
      const restBlocks = await enlarged(w, restBitmap, page, ((await w.recognize(await rest.convertToBlob({ type: 'image/png' }), {}, { blocks: true, text: false })).data.blocks ?? []) as ReadBlock[])
      // Where the model saw no text, a paragraph must be sure on the whole and must not repeat a region.
      const left = paragraphRegions(restBlocks, REST_MEAN).filter((p) => regions.every((r) => inside(p.box, r.box) < 0.3))
      return readingOrder([...joinLines(regions), ...left]).map((r) => r.text).filter(Boolean).join('\n\n')
    } finally {
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, thresholding_method: '2' } as Record<string, string>).catch(() => {})
      listeners.delete(model)
    }
  })
}
