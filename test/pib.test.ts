// The PIB fetcher's parsing, on a page shaped like the real one. A release
// page lists every language of the release except its own, so the page's own
// language has to come out of its text. Importing this must not fetch: the
// scraper's work sits behind `import.meta.main`.
import { describe, expect, test } from 'bun:test'
import { pageLang, parseRelease, settled } from '../bench/pib'

const page = (title: string, links: string) =>
  `<div class="innner-page-main-about-us-content-right-part">` +
  `<div id="MinistryName" class="x">Ministry of Textiles</div>` +
  `<h1 id="Titleh2">${title}</h1>` +
  `<div id="PrDateTime" class="x">Posted On: 04 OCT 2026 7:01PM by PIB Delhi</div>` +
  `<p>Cotton Corporation of India</p>` +
  `<span id="ReleaseId">(Release ID: 2318919)</span><span id="lblViews">Visitor Counter : 11</span>` +
  `</div><div id="P_CategoryManagement"></div>` +
  `<div class="ReleaseLang">Read this release in: ${links}</div>`

const link = (prid: string, label: string) => `<a href='https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}' target="_blank"> ${label} </a>`

describe('PIB release parsing', () => {
  test('an English page, which lists only its translations', () => {
    const r = parseRelease('2318919', page('Cotton reforms', link('2318933', 'हिन्दी')), 'en')
    expect(r.lang).toBe('en')
    expect(r.title).toBe('Cotton reforms')
    expect(r.body).toBe('Cotton Corporation of India')
    expect(r.translations).toEqual({ hi: '2318933' })
  })

  test('a translation page, named by its own script', () => {
    const r = parseRelease('2318933', page('कपास सुधार', link('2318919', 'English')))
    expect(r.lang).toBe('hi')
    expect(r.translations).toEqual({ en: '2318919' })
  })

  test('decodes the entities PIB writes into its paragraphs', () => {
    const html = page('T', link('2318919', 'हिन्दी')).replace(
      '<p>Cotton Corporation of India</p>',
      '<p>as part of &lsquo;Reform Utsav 2026&rsquo; &mdash; &amp;lsquo;twice&amp;rsquo; &nbsp;&#8377;4,000</p>',
    )
    expect(parseRelease('2318919', html, 'en').body).toBe('as part of \u2018Reform Utsav 2026\u2019 \u2014 \u2018twice\u2019 \u20b94,000')
  })

  test('the feed names the language where the script cannot', () => {
    expect(pageLang('कपास सुधार', 'mr')).toBe('mr')
    expect(pageLang('कपास सुधार', 'hi')).toBe('hi')
    expect(pageLang('Cotton reforms', 'en')).toBe('en')
  })
})

describe('cache freshness', () => {
  // A release gains its translations in the days after it is posted: a page
  // cached on day one would keep an empty language block for good.
  const html = page('Cotton reforms', '')
  test('a page read within a week of its release is not settled', () => {
    expect(settled(html, new Date('2026-10-06T12:00:00Z'))).toBe(false)
  })
  test('a week on, it is settled and the cache is trusted', () => {
    expect(settled(html, new Date('2026-10-12T12:00:00Z'))).toBe(true)
  })
  test('a page with no readable date is trusted, not refetched forever', () => {
    expect(settled('<div>no date</div>', new Date())).toBe(true)
  })
})


describe('languages that share a script with another', () => {
  test('a Devanagari page from the Konkani feed is Konkani, not Hindi', () => {
    expect(pageLang('पणजे येथ कार्यक्रम', 'gom')).toBe('gom')
  })
  test('a Latin-script page from the Mizo, Khasi or Tenyidei feed is not English', () => {
    expect(pageLang('Mizoram-ah hun pawimawh', 'lus')).toBe('lus')
    expect(pageLang('Ka jingiaseng', 'kha')).toBe('kha')
    expect(pageLang('Kohima ki', 'njm')).toBe('njm')
  })
  test('Manipuri in Bengali script stays Manipuri', () => {
    expect(pageLang('মণিপুরগী', 'mni')).toBe('mni')
  })
  test('with no hint, Latin is English', () => {
    expect(pageLang('Union Minister visits Kohima', '')).toBe('en')
  })
})

describe('entities PIB writes', () => {
  test('zero-width joiners come back as the characters, not as entity text', () => {
    // 2195987, Hindi: प्रसन्&zwj;नता came through undecoded.
    const r = parseRelease('1', page('प्रसन्&zwj;नता और नि&zwnj;यम', ''), 'hi')
    expect(r.title).toBe('प्रसन्‍नता और नि‌यम')
  })
})
