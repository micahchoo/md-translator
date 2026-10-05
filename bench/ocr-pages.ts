// Real scanned pages with human text for the OCR bench, from Wikisource: each
// language's "Validated" pages, whose transcription a second person checked
// against the scan. At most two pages a book, so no one typeface decides a
// language. The body is rendered by Wikisource itself and read back as text, so
// templates come out as the words they show; the running header and footer are
// left out of the reference, though the scan shows them. Scans and text go to
// the git-ignored corpus/ocr-pages/<code>/; nothing is copied into the repository.
//
//   bun bench/ocr-pages.ts <pages per language> [codes,comma,separated]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { LANGUAGES } from '../src/languages'

/** Our language code → its Wikisource. Nepali, Maithili, Sindhi and Konkani have none. */
export const WIKISOURCE: Record<string, string> = {
  en: 'en', as: 'as', bn: 'bn', gu: 'gu', hi: 'hi', kn: 'kn', ml: 'ml', mr: 'mr', or: 'or', pa: 'pa', sa: 'sa', ta: 'ta', te: 'te',
}
/** Pages whose reference is not a reading of their image, found by reading them. */
const EXCLUDED: [RegExp, string][] = [
  [/Explosive objects in War in Ukraine/, 'the image is Ukrainian; the text is its English translation'],
  [/Original manuscript of Gitanjali/, 'handwritten; the claim under test is about print'],
]
const OUT = 'corpus/ocr-pages'
const WIDTH = 2000
// Wikimedia's policy asks a bot to name itself and a contact; the repository is the contact.
const UA = 'md-translator-ocr-bench/0.1 (https://github.com/micahchoo/md-translator)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A page number in any of these scripts' digits, as ASCII: Devanagari ११७ is 117. */
export function asciiDigits(s: string): string {
  const ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66]
  return s.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!
    const zero = ZEROS.find((z) => cp >= z && cp < z + 10)
    return zero === undefined ? d : String(cp - zero)
  })
}

async function api(wiki: string, params: Record<string, string>): Promise<any> {
  // POST, because a page's wikitext sent to `parse` is longer than a URL may be.
  const url = `https://${wiki}.wikisource.org/w/api.php`
  const body = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  for (let attempt = 0; ; attempt++) {
    await sleep(1000)
    const res = await fetch(url, { method: 'POST', body, headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    if (res.status !== 429 || attempt === 4) throw new Error(`${res.status} from ${wiki} ${params.action}`)
    await sleep(10_000 * (attempt + 1))
  }
}

/** The body of a Page: wikitext between the header's and the footer's <noinclude>.
 *  A table may open in the header and close in the footer; its rows are closed
 *  in again here, or they render as raw markup. */
export function body(wikitext: string): string {
  const b = wikitext.replace(/^<noinclude>[\s\S]*?<\/noinclude>/, '').replace(/<noinclude>[\s\S]*?<\/noinclude>\s*$/, '')
  return /^\|-/m.test(b) && !/^\{\|/m.test(b) ? `{|\n${b}\n|}` : b
}

/** The share of a text's letters written in the language's own script. */
export function ownScript(text: string, code: string): number {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  return letters ? (text.match(new RegExp(LANGUAGES[code].script.source, 'g'))?.length ?? 0) / letters : 0
}

/** Rendered HTML to text: one line per block element, footnote markers and edit links dropped. */
export async function htmlText(html: string): Promise<string> {
  let skip = 0
  let text = ''
  const SKIP = 'sup.reference, .mw-editsection, style, script, .noprint, .ws-noexport'
  await new HTMLRewriter()
    .on(SKIP, { element(e) { skip++; e.onEndTag(() => { skip-- }) } })
    .on('p, div, br, li, h1, h2, h3, h4, h5, h6, tr, dd, dt', { element() { text += '\n' } })
    .on('*', { text(t) { if (!skip) text += t.text } })
    .transform(new Response(html))
    .text()
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
}

async function fetchLanguage(code: string, n: number) {
  const wiki = WIKISOURCE[code]
  const info = await api(wiki, { action: 'query', meta: 'proofreadinfo' })
  const validated = info.query.proofreadqualitylevels.find((q: any) => q.id === 4).category
  const ns = String(info.query.proofreadnamespaces.page.id)
  const members: string[] = []
  let cont: Record<string, string> = {}
  while (members.length < 2000) {
    const r = await api(wiki, { action: 'query', list: 'categorymembers', cmtitle: `Category:${validated}`, cmnamespace: ns, cmlimit: '500', ...cont })
    members.push(...r.query.categorymembers.map((m: any) => m.title))
    if (!r.continue) break
    cont = r.continue
  }
  // Spread through the category, two pages a book at most.
  const perBook = new Map<string, number>()
  const step = Math.max(1, Math.floor(members.length / (n * 4)))
  const chosen = members.filter((_, i) => i % step === 0).filter((t) => {
    const book = t.replace(/\/[^/]+$/, '')
    const k = perBook.get(book) ?? 0
    perBook.set(book, k + 1)
    return k < 2
  })
  mkdirSync(`${OUT}/${code}`, { recursive: true })
  let saved = 0
  for (const title of chosen) {
    if (saved === n) break
    const name = `${OUT}/${code}/${saved}`
    const excluded = EXCLUDED.find(([re]) => re.test(title))
    if (excluded) {
      console.warn(`${code} excluded ${title}: ${excluded[1]}`)
      continue
    }
    try {
      const m = title.match(/^[^:]+:(.+?)(?:\/(\p{Nd}+))?$/u)!
      const [file, page] = [m[1], m[2] && asciiDigits(m[2])]
      const rev = await api(wiki, { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: title })
      const wikitext = rev.query.pages[0].revisions[0].slots.main.content as string
      const parsed = await api(wiki, { action: 'parse', title, text: body(wikitext), contentmodel: 'wikitext', prop: 'text', disablelimitreport: '1' })
      const text = await htmlText(parsed.parse.text)
      // A page of a few words is a title page or a plate: no test of reading.
      if (text.replace(/\s/g, '').length < 200) throw new Error('too few words')
      // A preface in English inside a Sanskrit book tests the English model.
      if (ownScript(text, code) < 0.5) throw new Error('mostly in another script')
      const params: Record<string, string> = { action: 'query', prop: 'imageinfo', iiprop: 'url', titles: `File:${file}`, iiurlwidth: String(WIDTH) }
      if (page) params.iiurlparam = `page${page}-${WIDTH}px`
      const img = await api(wiki, params)
      const url = img.query.pages[0].imageinfo?.[0]?.thumburl
      if (!url) throw new Error(`no image for File:${file}`)
      await sleep(1000)
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`${res.status} for the image`)
      const ext = /\.png($|\?)/i.test(url) ? 'png' : 'jpg'
      writeFileSync(`${name}.${ext}`, new Uint8Array(await res.arrayBuffer()))
      writeFileSync(`${name}.txt`, text + '\n')
      writeFileSync(`${name}.json`, JSON.stringify({ code, wiki, title, image: url }) + '\n')
      saved++
      console.log(`${code} ${saved}/${n} ${title}`)
    } catch (e) {
      console.warn(`${code} skipped ${title}: ${e}`)
    }
  }
  if (saved < n) console.warn(`${code}: only ${saved} of ${n} pages`)
}

if (import.meta.main) {
  const [n, codes] = process.argv.slice(2)
  if (!n) throw new Error('usage: bun bench/ocr-pages.ts <pages per language> [codes]')
  for (const code of codes ? codes.split(',') : Object.keys(WIKISOURCE)) {
    if (existsSync(`${OUT}/${code}/${Number(n) - 1}.txt`)) continue
    await fetchLanguage(code, Number(n))
  }
}
