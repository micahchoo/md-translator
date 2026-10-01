// The page: documents in, translations out. Every decision about the text
// lives in translate.ts and the modules under it; this file only shows state
// and turns clicks into calls.
import type { Flag } from './checks'
import { LANGUAGES } from './languages'
import { createClient, listModels } from './llm'
import { unmask } from './segment'
import { DEFAULTS, formatExamples, loadSettings, parseExamples, saveSettings, toOptions, type Settings } from './settings'
import { translateDocument, type Progress } from './translate'

interface Doc {
  id: number
  name: string
  source: string
  status: 'idle' | 'running' | 'done' | 'stopped' | 'error'
  result?: Progress
  /** Language the result is in, for the download name. */
  lang?: string
  error?: string
  seconds?: number
}

const FLAG_TEXT: Record<Flag, string> = {
  empty: 'Nothing came back',
  untranslated: 'Left in English',
  partial: 'Partly in English',
  markup: 'Formatting changed',
  numbers: 'Numbers changed',
  short: 'May be missing text',
  long: 'May have added text',
  truncated: 'Cut off',
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = {
  lang: $<HTMLSelectElement>('lang'),
  docs: $('docs'),
  source: $<HTMLTextAreaElement>('source'),
  sourcePane: $('source-pane'),
  file: $<HTMLInputElement>('file'),
  translate: $<HTMLButtonElement>('translate'),
  translateAll: $<HTMLButtonElement>('translate-all'),
  stop: $<HTMLButtonElement>('stop'),
  status: $('status'),
  output: $<HTMLTextAreaElement>('output'),
  copy: $<HTMLButtonElement>('copy'),
  download: $<HTMLButtonElement>('download'),
  flags: $<HTMLDetailsElement>('flags'),
  flagsTitle: $('flags-title'),
  flagList: $('flag-list'),
  dialog: $<HTMLDialogElement>('settings'),
  form: $<HTMLFormElement>('settings-form'),
  connection: $('connection'),
  settingsError: $('settings-error'),
  examplesLabel: $('examples-label'),
}

const storage: Pick<Storage, 'getItem' | 'setItem'> = (() => {
  try {
    return window.localStorage
  } catch {
    return { getItem: () => null, setItem: () => {} }
  }
})()

let settings: Settings = loadSettings(storage)
let nextId = 1
const docs: Doc[] = [{ id: nextId++, name: 'Untitled', source: '', status: 'idle' }]
let current = docs[0].id
let controller: AbortController | null = null

const doc = () => docs.find((d) => d.id === current)!
const running = () => docs.some((d) => d.status === 'running')

// ---- rendering ------------------------------------------------------------

let frame = 0
function schedule() {
  if (!frame) frame = requestAnimationFrame(() => ((frame = 0), render()))
}

function render() {
  const d = doc()
  if (document.activeElement !== el.source && el.source.value !== d.source) el.source.value = d.source
  el.source.readOnly = d.status === 'running'

  el.docs.replaceChildren(...(docs.length > 1 || d.name !== 'Untitled' ? docs.map(docTab) : []))

  const busy = running()
  el.translate.hidden = busy
  el.translate.disabled = !d.source.trim()
  el.translateAll.hidden = busy || docs.filter((x) => x.source.trim()).length < 2
  el.stop.hidden = !busy

  const md = d.result?.markdown ?? ''
  if (el.output.value !== md) el.output.value = md
  el.copy.disabled = el.download.disabled = !md || d.status === 'running'

  el.status.classList.toggle('error', d.status === 'error')
  el.status.textContent = statusLine(d)
  renderFlags(d)
}

function docTab(d: Doc): HTMLElement {
  const tab = document.createElement('button')
  tab.type = 'button'
  tab.className = 'doc'
  tab.setAttribute('role', 'tab')
  tab.setAttribute('aria-selected', String(d.id === current))
  tab.title = d.name
  const state = document.createElement('span')
  state.className = `state ${d.status}`
  const name = document.createElement('span')
  name.textContent = d.name.length > 28 ? d.name.slice(0, 26) + '…' : d.name
  tab.append(state, name)
  if (docs.length > 1) {
    const x = document.createElement('span')
    x.className = 'x'
    x.textContent = '×'
    x.setAttribute('aria-label', `Remove ${d.name}`)
    x.onclick = (e) => {
      e.stopPropagation()
      if (d.status === 'running') return
      docs.splice(docs.indexOf(d), 1)
      if (current === d.id) current = docs[0].id
      render()
    }
    tab.append(x)
  }
  tab.onclick = () => {
    current = d.id
    render()
  }
  return tab
}

function statusLine(d: Doc): string {
  const units = d.result?.units ?? []
  const done = units.filter((u) => u.status === 'done').length
  const toCheck = units.filter((u) => u.flags.length).length
  const check = toCheck ? ` · ${toCheck} to check` : ''
  switch (d.status) {
    case 'idle':
      return d.source.trim() ? 'Ready.' : 'Nothing translated yet.'
    case 'running':
      return units.length ? `Translating block ${Math.min(done + 1, units.length)} of ${units.length}${check}` : 'Starting…'
    case 'done':
      return units.length ? `Done in ${d.seconds} s · ${units.length} blocks${check}` : 'Nothing in this document needs translating.'
    case 'stopped':
      return `Stopped after ${done} of ${units.length} blocks. Untranslated blocks are left in English.`
    case 'error':
      return d.error ?? 'Something went wrong.'
  }
}

function renderFlags(d: Doc) {
  const flagged = (d.result?.units ?? []).filter((u) => u.status === 'done' && u.flags.length)
  el.flags.hidden = !flagged.length
  if (!flagged.length) return
  el.flagsTitle.textContent = `${flagged.length} ${flagged.length === 1 ? 'block' : 'blocks'} to check`
  el.flagList.replaceChildren(
    ...flagged.map((u) => {
      const li = document.createElement('li')
      const tags = document.createElement('div')
      tags.className = 'tags'
      tags.textContent = u.flags.map((f) => FLAG_TEXT[f]).join(' · ')
      const src = document.createElement('div')
      src.className = 'src'
      src.textContent = unmask(u.unit.text, u.unit.restore)
      const out = document.createElement('div')
      out.textContent = unmask(u.output, u.unit.restore)
      li.append(tags, src, out)
      return li
    }),
  )
}

// ---- translation ----------------------------------------------------------

async function translate(targets: Doc[]) {
  controller = new AbortController()
  const complete = createClient({ endpoint: settings.endpoint, model: settings.model })
  const opts = toOptions(settings)
  for (const d of targets) {
    if (controller.signal.aborted) break
    d.status = 'running'
    d.lang = opts.language.code
    d.error = undefined
    d.result = undefined
    const started = performance.now()
    render()
    try {
      d.result = await translateDocument(d.source, opts, complete, (p) => ((d.result = p), schedule()), controller.signal)
      d.status = 'done'
      d.seconds = Math.round((performance.now() - started) / 1000)
    } catch (e) {
      if (controller.signal.aborted) d.status = 'stopped'
      else {
        d.status = 'error'
        d.error = explain(e)
        break
      }
    }
    render()
  }
  controller = null
  render()
}

function explain(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (e instanceof TypeError)
    return `Could not reach ${settings.endpoint}. Check that the model server is running and allows requests from this page. If Chrome asks to allow access to devices on your network, allow it.`
  return `The model server answered with an error: ${msg}`
}

// ---- documents ------------------------------------------------------------

async function addFiles(files: FileList | File[]) {
  const list = [...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) || f.type.startsWith('text/'))
  if (!list.length) return
  // An untouched empty document is replaced, not kept beside the new ones.
  const blank = docs.length === 1 && !docs[0].source.trim() && docs[0].status === 'idle'
  if (blank) docs.length = 0
  for (const f of list) docs.push({ id: nextId++, name: f.name, source: await f.text(), status: 'idle' })
  current = docs[docs.length - list.length].id
  render()
}

el.source.addEventListener('input', () => {
  const d = doc()
  d.source = el.source.value
  if (d.status !== 'running') {
    d.status = 'idle'
    d.result = undefined
  }
  render()
})
el.source.addEventListener('paste', () => {
  // A pasted document is named by its first heading, so tabs stay legible.
  queueMicrotask(() => {
    const d = doc()
    const h = d.source.match(/^#{1,6}\s+(.+)$/m)?.[1]
    if (d.name === 'Untitled' && h) {
      d.name = h.trim()
      render()
    }
  })
})

$('new-doc').onclick = () => {
  docs.push({ id: nextId++, name: 'Untitled', source: '', status: 'idle' })
  current = docs[docs.length - 1].id
  render()
  el.source.focus()
}
$('add-files').onclick = () => el.file.click()
el.file.onchange = () => {
  if (el.file.files) addFiles(el.file.files)
  el.file.value = ''
}
for (const type of ['dragenter', 'dragover'])
  el.sourcePane.addEventListener(type, (e) => {
    e.preventDefault()
    el.sourcePane.classList.add('dropping')
  })
for (const type of ['dragleave', 'drop'])
  el.sourcePane.addEventListener(type, () => el.sourcePane.classList.remove('dropping'))
el.sourcePane.addEventListener('drop', (e) => {
  e.preventDefault()
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files)
})

el.translate.onclick = () => translate([doc()])
el.translateAll.onclick = () => translate(docs.filter((d) => d.source.trim()))
el.stop.onclick = () => controller?.abort()

el.copy.onclick = async () => {
  try {
    await navigator.clipboard.writeText(el.output.value)
  } catch {
    el.output.select()
    document.execCommand('copy')
  }
  el.copy.textContent = 'Copied'
  setTimeout(() => (el.copy.textContent = 'Copy'), 1500)
}
el.download.onclick = () => {
  const d = doc()
  const base = d.name.replace(/\.(md|markdown|txt)$/i, '') || 'translation'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([el.output.value], { type: 'text/markdown;charset=utf-8' }))
  a.download = `${base}.${d.lang ?? settings.language}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---- language and settings ------------------------------------------------

el.lang.replaceChildren(
  ...Object.values(LANGUAGES).map((l) => new Option(l.name, l.code, false, l.code === settings.language)),
)
el.lang.onchange = () => {
  settings.language = el.lang.value
  saveSettings(storage, settings)
}

const field = (name: string) => el.form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement

function fillForm(s: Settings) {
  const lang = LANGUAGES[s.language]
  field('endpoint').value = s.endpoint
  field('model').value = s.model
  field('passageLength').value = String(s.passageLength)
  field('contextBlocks').value = String(s.contextBlocks)
  field('retries').value = String(s.retries)
  field('preamble').value = s.preamble
  field('examples').value = formatExamples(s.examples[lang.code] ?? lang.examples, lang.name)
  field('skipKeys').value = s.skipKeys
  el.examplesLabel.textContent = `Examples (English → ${lang.name})`
  el.settingsError.textContent = ''
  el.connection.textContent = ''
}

$('open-settings').onclick = () => {
  fillForm(settings)
  el.dialog.showModal()
}
$('reset-settings').onclick = () => fillForm({ ...structuredClone(DEFAULTS), language: settings.language })
$('test-connection').onclick = async () => {
  el.connection.textContent = 'Connecting…'
  try {
    const models = await listModels(field('endpoint').value)
    el.connection.textContent = models.length ? `Connected. Models: ${models.join(', ')}` : 'Connected.'
  } catch (e) {
    el.connection.textContent = e instanceof TypeError ? 'Could not reach that endpoint.' : `Error: ${(e as Error).message}`
  }
}
el.form.addEventListener('submit', (e) => {
  if ((e.submitter as HTMLButtonElement | null)?.value !== 'save') return
  const lang = LANGUAGES[settings.language]
  try {
    const examples = parseExamples(field('examples').value, lang.name)
    settings = {
      ...settings,
      endpoint: field('endpoint').value.trim(),
      model: field('model').value.trim(),
      passageLength: Number(field('passageLength').value),
      contextBlocks: Number(field('contextBlocks').value),
      retries: Number(field('retries').value),
      preamble: field('preamble').value,
      examples: { ...settings.examples, [lang.code]: examples },
      skipKeys: field('skipKeys').value,
    }
    if (!saveSettings(storage, settings)) el.settingsError.textContent = 'Saved for this visit only: this browser blocks storage.'
  } catch (err) {
    e.preventDefault()
    el.settingsError.textContent = (err as Error).message
  }
})

render()
