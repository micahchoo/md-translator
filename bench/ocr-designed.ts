// Designed pages for the OCR bench: screenshots of Indic news front pages, with
// the text the DOM shows inside each screenshot as its reference. News fronts
// are dense designed layouts: columns, photographs with captions, coloured
// boxes, English mixed in. Two screens a page, the top and one further down.
// The DOM's order is not always the eye's, which chrF barely notices. Pages and
// text go to the git-ignored corpus/ocr-designed/<code>/; nothing is copied
// into the repository. Needs Playwright's Chromium (bunx playwright install chromium).
//
//   bun bench/ocr-designed.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const OUT = 'corpus/ocr-designed'
const PAGES: Record<string, string[]> = {
  hi: ['https://www.bbc.com/hindi', 'https://www.amarujala.com/'],
  bn: ['https://www.bbc.com/bengali', 'https://www.anandabazar.com/'],
  mr: ['https://www.bbc.com/marathi', 'https://www.loksatta.com/'],
  gu: ['https://www.bbc.com/gujarati', 'https://www.divyabhaskar.co.in/'],
  pa: ['https://www.bbc.com/punjabi', 'https://www.jagbani.com/'],
  kn: ['https://www.prajavani.net/', 'https://vijaykarnataka.com/'],
  en: ['https://www.thehindu.com/', 'https://indianexpress.com/'],
}
const SCREENS = [0, 1400] // the top, and one screen further down
const browser = await chromium.launch()
for (const [code, urls] of Object.entries(PAGES)) {
  mkdirSync(`${OUT}/${code}`, { recursive: true })
  let n = 0
  for (const url of urls) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-IN' })
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(4000)
      for (const y of SCREENS) {
        await page.evaluate((y: number) => window.scrollTo(0, y), y)
        await page.waitForTimeout(1500)
        // The text a reader sees in this screen: every visible text node whose
        // box lies inside the viewport, in DOM order.
        const text = await page.evaluate(() => {
          const out: string[] = []
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let node; (node = walker.nextNode()); ) {
            const t = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (!t) continue
            const el = node.parentElement
            const style = el && getComputedStyle(el)
            if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            const r = range.getBoundingClientRect()
            if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue
            out.push(t)
          }
          return out.join('\n')
        })
        if (text.replace(/\s/g, '').length < 200) continue
        await page.screenshot({ path: `${OUT}/${code}/${n}.png` })
        writeFileSync(`${OUT}/${code}/${n}.txt`, text + '\n')
        writeFileSync(`${OUT}/${code}/${n}.json`, JSON.stringify({ code, url, scroll: y }) + '\n')
        console.log(code, n, url, y, text.length)
        n++
      }
    } catch (e) {
      console.warn(code, url, String(e).slice(0, 120))
    }
    await page.close()
  }
}
await browser.close()
