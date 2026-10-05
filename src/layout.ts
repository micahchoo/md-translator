// Where the text on a page is. PP-DocLayout-S (PaddlePaddle, Apache 2.0),
// converted to ONNX and served from this site, finds a page's paragraphs,
// titles and captions, and each is read on its own. bench/ocr-layout.py
// measured it: on 22 designed pages (news fronts) 57.0 chrF with Tesseract's
// own layout and 65.4 region by region; on 147 pages of books 74.2 and 74.1.
//
// It runs on ONNX Runtime, which reading aloud already loads, and loads on
// the first image.

export const LABELS = 'paragraph_title image text number abstract content figure_title formula table table_title reference doc_title footnote header algorithm footer seal chart_title chart formula_number header_image footer_image aside_text'.split(' ')
/** Regions that are not text to read. */
const NOT_TEXT = new Set(['image', 'chart', 'seal', 'header_image', 'footer_image', 'formula'])
/** A text region the detector is less sure of than this is left to Tesseract's own pass. */
const TEXT_SCORE = 0.25
/** Smaller than this many pixels a side, a region cannot hold a line. */
const TOO_SMALL = 8

export type Box = [x1: number, y1: number, x2: number, y2: number]
export interface Region {
  box: Box
  text: string
}

/** The share of `a`'s area that lies inside `b`. */
export function inside(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  return (ix * iy) / Math.max(1, (a[2] - a[0]) * (a[3] - a[1]))
}

/**
 * The detector's rows of six, [label, score, x1, y1, x2, y2] in page pixels,
 * as text regions to read. A region mostly inside one already kept, the more
 * sure one, is the same text found twice.
 */
export function regionsOf(rows: ArrayLike<number>, width: number, height: number): Region[] {
  const found: { label: string; score: number; box: Box }[] = []
  for (let i = 0; i + 5 < rows.length; i += 6) {
    const box: Box = [Math.max(0, rows[i + 2]), Math.max(0, rows[i + 3]), Math.min(width, rows[i + 4]), Math.min(height, rows[i + 5])]
    found.push({ label: LABELS[rows[i]] ?? '', score: rows[i + 1], box })
  }
  const kept: Box[] = []
  for (const f of found.filter((f) => !NOT_TEXT.has(f.label) && f.score >= TEXT_SCORE).sort((a, b) => b.score - a.score)) {
    if (f.box[2] - f.box[0] < TOO_SMALL || f.box[3] - f.box[1] < TOO_SMALL) continue
    if (kept.every((k) => inside(f.box, k) < 0.5 && inside(k, f.box) < 0.5)) kept.push(f.box)
  }
  return kept.map((box) => ({ box, text: '' }))
}

/** Pixels round a region, for a letter's marks above and below its line. */
const MARGIN = 24

/**
 * The crop a region is read from: MARGIN on each side, cut to half the gap to
 * any text region beside it, so a crop never reads a neighbour's lines. A
 * green box split into one region a line came back with each line's
 * neighbours read into it.
 */
export function cropAround(r: Region, regions: Region[], width: number, height: number): Box {
  const [x1, y1, x2, y2] = r.box
  const m = [MARGIN, MARGIN, MARGIN, MARGIN]
  for (const k of regions) {
    if (k === r) continue
    const [a, b, c, d] = k.box
    if (a < x2 && c > x1) {
      if (d <= y1) m[1] = Math.min(m[1], (y1 - d) / 2)
      if (b >= y2) m[3] = Math.min(m[3], (b - y2) / 2)
    }
    if (b < y2 && d > y1) {
      if (c <= x1) m[0] = Math.min(m[0], (x1 - c) / 2)
      if (a >= x2) m[2] = Math.min(m[2], (a - x2) / 2)
    }
  }
  return [Math.max(0, x1 - m[0]), Math.max(0, y1 - m[1]), Math.min(width, x2 + m[2]), Math.min(height, y2 + m[3])]
}

/**
 * XY-cut: cut the regions at the widest gap that crosses all of them, across
 * or down the page, and order each side the same way. A title over two
 * columns comes off first; then the gap between the columns is wider than any
 * between their paragraphs, so the left column reads before the right one even
 * where their paragraphs line up.
 */
export function readingOrder<R extends Region>(regions: R[]): R[] {
  if (regions.length <= 1) return regions
  let best: { gap: number; axis: number; at: number } | null = null
  for (const axis of [1, 0]) {
    const sorted = [...regions].sort((a, b) => a.box[axis] - b.box[axis])
    let end = sorted[0].box[axis + 2]
    for (const r of sorted.slice(1)) {
      const gap = r.box[axis] - end
      if (gap >= 0 && (!best || gap > best.gap)) best = { gap, axis, at: r.box[axis] }
      end = Math.max(end, r.box[axis + 2])
    }
  }
  if (!best) return [...regions].sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0])
  const { axis, at } = best
  return [...readingOrder(regions.filter((r) => r.box[axis] < at)), ...readingOrder(regions.filter((r) => r.box[axis] >= at))]
}

/**
 * Regions one line high, stacked under each other with less than 0.6 of a
 * line between them and overlapping by half their width, are one paragraph
 * the model cut into lines: a box of three lines came back as three
 * paragraphs, one sentence sent to translation in three blocks. A region of
 * several lines is never joined, so a headline stays off the summary under it.
 * `h` is a region's line height as read.
 */
export function joinLines<R extends Region & { h?: number }>(regions: R[]): R[] {
  const oneLine = (r: R) => !!r.h && r.box[3] - r.box[1] < 1.6 * r.h
  const out: (R & { open: boolean })[] = []
  for (const r of [...regions].sort((a, b) => a.box[1] - b.box[1])) {
    const above = oneLine(r) && r.text
      ? out.find((o) => {
          if (!o.open || !o.text) return false
          const [a, b] = [o.box, r.box]
          const overlap = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
          const gap = b[1] - a[3]
          return overlap >= 0.5 * Math.min(a[2] - a[0], b[2] - b[0]) && gap >= 0 && gap < 0.6 * Math.min(r.h!, o.h!)
        })
      : undefined
    if (above) {
      above.text += ' ' + r.text
      above.box = [Math.min(above.box[0], r.box[0]), above.box[1], Math.max(above.box[2], r.box[2]), r.box[3]]
    } else out.push({ ...r, open: oneLine(r) })
  }
  return out.map(({ open, ...r }) => r as unknown as R)
}

// ---- detecting, in the browser --------------------------------------------

/** Served from this site's public/models, beside the page. */
const MODEL = 'models/pp-doclayout-s.onnx'
const SIZE = 480
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let session: Promise<{ ort: typeof import('onnxruntime-web/wasm'); session: import('onnxruntime-web').InferenceSession }> | undefined

function detector() {
  if (!session) {
    session = (async () => {
      const ort = await import('onnxruntime-web/wasm')
      const url = new URL(MODEL, document.baseURI).href
      return { ort, session: await ort.InferenceSession.create(url, { executionProviders: ['wasm'] }) }
    })()
    // A failed load is not kept: the next image tries again.
    session.catch(() => (session = undefined))
  }
  return session
}

/** The text regions of a page. */
export async function detect(image: ImageBitmap): Promise<Region[]> {
  const { ort, session } = await detector()
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0, SIZE, SIZE)
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  const input = new Float32Array(3 * SIZE * SIZE)
  for (let i = 0; i < SIZE * SIZE; i++)
    for (let c = 0; c < 3; c++) input[c * SIZE * SIZE + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c]
  const out = await session.run({
    image: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]),
    scale_factor: new ort.Tensor('float32', Float32Array.from([SIZE / image.height, SIZE / image.width]), [1, 2]),
  })
  return regionsOf(out[session.outputNames[0]].data as Float32Array, image.width, image.height)
}
