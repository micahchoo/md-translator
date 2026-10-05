// Whether Tesseract.js reads each language well enough to offer OCR. Two sets:
// `synthetic`, IN22's sentences drawn by pango-view as clean print and as a
// rough 150 dpi scan (half size, blurred, tilted, JPEG at 55); and `pages`, the
// real scans from ocr-pages.ts with their proofread text. The first is the best
// case and the second is old letterpress, so between them they bracket a page
// someone will actually attach. Tesseract.js runs here under Bun: the same
// WebAssembly engine and models the browser would run.
//
// The models are tessdata_fast, pinned to one commit and cached in corpus/.
// Outputs go to corpus/runs/ocr/<set>[-<variant>].jsonl; score with
// `uv run bench/score-ocr.py [variant]`. A variant is one setting the page
// could ship, measured against the same floors as the base:
//   eng      the language's model and English's together, for pages that mix them
//   tiled    Tesseract's tiled Otsu thresholding instead of one global threshold
//   sauvola  Sauvola's adaptive thresholding: for a grey page in a white margin
//   hin      the Hindi model for every Devanagari language
//
//   bun bench/ocr.ts [synthetic|pages] [codes,comma,separated|all] [variant]
import { $ } from 'bun'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createWorker } from 'tesseract.js'
import { in22Rows, spread } from './in22'
import { WIKISOURCE } from './ocr-pages'
import { TESSDATA_COMMIT } from '../src/ocr'

/** Every language tried, with the Tesseract model that reads it, its IN22
 *  column and a font with its letters. Bodo, Dogri, Konkani, Maithili and
 *  Sindhi (in Devanagari) have no model of their own; Kashmiri borrows Urdu's. */
export const OCR_CANDIDATES: Record<string, { model: string; column: string; font: string }> = {
  en: { model: 'eng', column: 'eng_Latn', font: 'Noto Sans' },
  as: { model: 'asm', column: 'asm_Beng', font: 'Noto Sans Bengali' },
  bn: { model: 'ben', column: 'ben_Beng', font: 'Noto Sans Bengali' },
  brx: { model: 'hin', column: 'brx_Deva', font: 'Noto Sans Devanagari' },
  doi: { model: 'hin', column: 'doi_Deva', font: 'Noto Sans Devanagari' },
  gu: { model: 'guj', column: 'guj_Gujr', font: 'Noto Sans Gujarati' },
  hi: { model: 'hin', column: 'hin_Deva', font: 'Noto Sans Devanagari' },
  kn: { model: 'kan', column: 'kan_Knda', font: 'Noto Sans Kannada' },
  ks: { model: 'urd', column: 'kas_Arab', font: 'Noto Nastaliq Urdu' },
  gom: { model: 'mar', column: 'gom_Deva', font: 'Noto Sans Devanagari' },
  mai: { model: 'hin', column: 'mai_Deva', font: 'Noto Sans Devanagari' },
  ml: { model: 'mal', column: 'mal_Mlym', font: 'Noto Sans Malayalam' },
  mr: { model: 'mar', column: 'mar_Deva', font: 'Noto Sans Devanagari' },
  ne: { model: 'nep', column: 'npi_Deva', font: 'Noto Sans Devanagari' },
  or: { model: 'ori', column: 'ory_Orya', font: 'Noto Sans Oriya' },
  pa: { model: 'pan', column: 'pan_Guru', font: 'Noto Sans Gurmukhi' },
  sa: { model: 'san', column: 'san_Deva', font: 'Noto Sans Devanagari' },
  sd: { model: 'hin', column: 'snd_Deva', font: 'Noto Sans Devanagari' },
  ta: { model: 'tam', column: 'tam_Taml', font: 'Noto Sans Tamil' },
  te: { model: 'tel', column: 'tel_Telu', font: 'Noto Sans Telugu' },
  ur: { model: 'urd', column: 'urd_Arab', font: 'Noto Nastaliq Urdu' },
}

const TESSDATA = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_COMMIT}`
const MODELS = 'corpus/tessdata-fast'
const IMAGES = 'corpus/ocr-synthetic'
const OUT = 'corpus/runs/ocr'

type Variant = 'base' | 'eng' | 'tiled' | 'sauvola' | 'hin'
const THRESHOLDING: Partial<Record<Variant, string>> = { tiled: '1', sauvola: '2' }

function modelFor(code: string, variant: Variant): string {
  const l = OCR_CANDIDATES[code]
  if (variant === 'eng') return l.model === 'eng' ? 'eng' : `${l.model}+eng`
  if (variant === 'hin' && l.font.includes('Devanagari')) return 'hin'
  return l.model
}

async function model(name: string) {
  if (name.includes('+')) {
    for (const part of name.split('+')) await model(part)
    return
  }
  const path = `${MODELS}/${name}.traineddata`
  if (existsSync(path)) return
  mkdirSync(MODELS, { recursive: true })
  const res = await fetch(`${TESSDATA}/${name}.traineddata`)
  if (!res.ok) throw new Error(`${res.status} for ${name}.traineddata`)
  writeFileSync(path, new Uint8Array(await res.arrayBuffer()))
}

/** One sentence as clean print and as a scan; pango shapes every script, RTL included. */
async function draw(text: string, font: string, base: string): Promise<{ clean: string; scan: string }> {
  const clean = `${base}.png`, scan = `${base}.jpg`
  if (!existsSync(clean)) {
    await $`pango-view -q --font=${font + ' 21'} --width=1060 --wrap=word --margin=20 --background=white --foreground=black --text=${text} -o ${clean}`
    await $`magick ${clean} -resize 50% -blur 0x0.5 -background white -rotate 0.6 -flatten -quality 55 ${scan}`
  }
  return { clean, scan }
}

/** The pages whose model a code uses: its own Wikisource's, or Hindi's for a
 *  Devanagari model with no Wikisource of its own. */
function pageDir(code: string, name: string): string | undefined {
  const base = name.split('+')[0]
  const own = Object.entries(OCR_CANDIDATES).find(([c, l]) => l.model === base && WIKISOURCE[c])?.[0]
  if (own) return `corpus/ocr-pages/${own}`
  return OCR_CANDIDATES[code].font.includes('Devanagari') ? 'corpus/ocr-pages/hi' : undefined
}

async function read(name: string, images: string[], variant: Variant): Promise<string[]> {
  await model(name)
  const worker = await createWorker(name, 1, { langPath: MODELS, gzip: false, cachePath: `${MODELS}/.cache` })
  if (THRESHOLDING[variant]) await worker.setParameters({ thresholding_method: THRESHOLDING[variant] } as any)
  const out: string[] = []
  for (const img of images) out.push((await worker.recognize(img)).data.text.trim())
  await worker.terminate()
  return out
}

if (import.meta.main) {
  const [set = 'synthetic', codes = 'all', variant = 'base'] = process.argv.slice(2) as [string, string, Variant]
  if (!['base', 'eng', 'tiled', 'sauvola', 'hin'].includes(variant)) throw new Error(`no variant ${variant}`)
  const chosen = codes === 'all' ? Object.keys(OCR_CANDIDATES) : codes.split(',')
  mkdirSync(OUT, { recursive: true })
  const lines: string[] = []
  if (set === 'synthetic') {
    const rows = spread(await in22Rows(), 20)
    mkdirSync(IMAGES, { recursive: true })
    for (const code of chosen) {
      const l = OCR_CANDIDATES[code]
      const drawn = await Promise.all(rows.map((r, i) => draw(r[l.column], l.font, `${IMAGES}/${code}-${i}`)))
      for (const cond of ['clean', 'scan'] as const) {
        const started = performance.now()
        const outputs = await read(modelFor(code, variant), drawn.map((d) => d[cond]), variant)
        const seconds = (performance.now() - started) / 1000 / rows.length
        outputs.forEach((output, i) => lines.push(JSON.stringify({ code, model: modelFor(code, variant), cond, i, seconds, reference: rows[i][l.column], output })))
        console.log(`${code} ${cond} ${seconds.toFixed(2)} s/image`)
      }
    }
  } else if (set === 'pages') {
    // A model is read once on its pages; every code that shares it shares the result.
    const done = new Map<string, string[]>()
    for (const code of chosen) {
      const name = modelFor(code, variant)
      const dir = pageDir(code, name)
      if (!dir || !existsSync(dir)) { console.log(`${code}: no pages`); continue }
      const ids = readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', '')).sort((a, b) => Number(a) - Number(b))
      const image = (id: string) => readdirSync(dir).find((f) => f.startsWith(`${id}.`) && /\.(jpg|png)$/.test(f))!
      const key = `${name} ${dir}`
      const started = performance.now()
      if (!done.has(key)) done.set(key, await read(name, ids.map((id) => `${dir}/${image(id)}`), variant))
      const seconds = (performance.now() - started) / 1000 / ids.length
      done.get(key)!.forEach((output, i) =>
        lines.push(JSON.stringify({ code, model: name, cond: 'page', i, seconds, pages: dir, reference: readFileSync(`${dir}/${ids[i]}.txt`, 'utf8').trim(), output })))
      console.log(`${code} ${dir} ${seconds.toFixed(2)} s/page`)
    }
  } else throw new Error('usage: bun bench/ocr.ts [synthetic|pages] [codes|all] [variant]')
  writeFileSync(`${OUT}/${set}${variant === 'base' ? '' : '-' + variant}.jsonl`, lines.join('\n') + '\n')
}
