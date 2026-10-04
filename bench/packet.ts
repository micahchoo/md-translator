// A review packet for a reader who knows the language: one HTML file per
// language, English beside the translation, every block marked right, wrong or
// unsure with a note, and a button that saves the answers as a file to send
// back. It works offline and needs no server. The text is this project's own
// public README, never the owner's documents.
//
//   bun bench/packet.ts [blocks = 25] [codes...]      writes corpus/review/<code>.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { directionLabel, LANGUAGES } from '../src/languages'
import { createClient } from '../src/llm'
import { FLAG_TEXT } from '../src/blocks'
import { segment, unmask } from '../src/segment'
import { DEFAULTS, toOptions } from '../src/settings'
import { translateDocument } from '../src/translate'

const max = Number(process.argv[2] ?? 25)
const codes = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(LANGUAGES).filter((c) => c !== 'en')
const full = readFileSync('README.md', 'utf8')
const all = segment(full, { skipKeys: [] })
const md = full.slice(0, full.indexOf('\n', all[Math.min(max, all.length) - 1].end) + 1)
const complete = createClient({ endpoint: DEFAULTS.endpoint, model: DEFAULTS.model })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
mkdirSync('corpus/review', { recursive: true })

for (const code of codes) {
  const lang = LANGUAGES[code]
  const r = await translateDocument(md, toOptions({ ...DEFAULTS, language: code }), complete, () => {})
  const rows = r.units
    .map((u, i) => {
      const flags = u.flags.map((f) => `<span class="flag">${esc(FLAG_TEXT[f])}</span>`).join(' ')
      const choice = (v: string) => `<label><input type="radio" name="b${i}" value="${v}"> ${v}</label>`
      return `<tr><td class="n">${i + 1}</td><td lang="en">${esc(unmask(u.unit.text, u.unit.restore))}</td>
<td lang="${code}" dir="${lang.dir ?? 'ltr'}">${esc(unmask(u.output, u.unit.restore))} ${flags}</td>
<td class="mark">${choice('right')}${choice('wrong')}${choice('unsure')}<textarea name="n${i}" placeholder="What is wrong?" rows="2"></textarea></td></tr>`
    })
    .join('\n')
  writeFileSync(
    `corpus/review/${code}.html`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review: ${esc(directionLabel(lang))}</title>
<style>
:root { --ink: #1d1d1b; --muted: #6b6b66; --line: #ddd8cc; --paper: #fbfaf6; --warn: #8a5a00; }
@media (prefers-color-scheme: dark) { :root { --ink: #ecebe6; --muted: #a3a29b; --line: #3a3934; --paper: #1c1c1a; --warn: #e0b34a; } }
body { margin: 0 auto; max-width: 1100px; padding: 16px; font: 16px/1.6 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
h1 { font-size: 1.3rem; } p { color: var(--muted); max-width: 70ch; }
table { width: 100%; border-collapse: collapse; } td { border-top: 1px solid var(--line); padding: 10px 8px; vertical-align: top; }
td.n { color: var(--muted); width: 2em; } td[lang]:not([lang="en"]) { font-size: 1.07em; line-height: 1.85; }
td.mark { width: 14em; } td.mark label { display: block; } textarea { width: 100%; font: inherit; margin-top: 4px; }
.flag { font-size: 0.8rem; color: var(--warn); border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; white-space: nowrap; }
button { font: inherit; padding: 8px 14px; margin: 16px 0; }
@media (max-width: 700px) { tr, td { display: block; } td.n { width: auto; } td.mark { width: auto; } }
</style></head><body>
<h1>Please check these translations: ${esc(directionLabel(lang))}</h1>
<p>A program translated the English on the left into ${esc(lang.name)}, by machine. For each block, choose <b>right</b> if a reader of ${esc(lang.name)} would take the same meaning from it, <b>wrong</b> if not, or <b>unsure</b>. Look especially for a lost "not", a missing part of a sentence, a changed name, number or day, and words in a related language. A tag beside a translation means the program already suspected a problem. When you finish, press the button and send the file it saves.</p>
<table>${rows}</table>
<button id="save">Save my answers</button>
<script>
document.getElementById('save').onclick = () => {
  const answers = [...document.querySelectorAll('tr')].map((tr, i) => ({
    block: i + 1,
    mark: tr.querySelector('input:checked')?.value ?? '',
    note: tr.querySelector('textarea').value,
  }))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ language: '${code}', answers }, null, 2)], { type: 'application/json' }))
  a.download = 'review-${code}.json'
  a.click()
}
</script></body></html>
`,
  )
  process.stderr.write(`${code} `)
}
process.stderr.write('\n')
