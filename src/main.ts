// The page: documents in, translations out. Every decision about the text
// lives in translate.ts and the modules under it; this file only shows state
// and turns clicks into calls.
import { BlockList } from './blocks'
import { dirOf, LANGUAGES } from './languages'
import { createClient, listModels } from './llm'
import { DEFAULTS, formatExamples, loadSettings, parseExamples, saveSettings, toOptions, type Settings } from './settings'
import { loadDocs, saveDocs, type SavedDoc } from './store'
import { editUnit, progressOf, retryUnit, translateDocument } from './translate'

type View = 'source' | 'blocks' | 'markdown'

interface Doc extends SavedDoc {
  view: View
  error?: string
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = {
  lang: $<HTMLSelectElement>('lang'),
  docs: $('docs'),
  file: $<HTMLInputElement>('file'),
  source: $<HTMLTextAreaElement>('source'),
  output: $<HTMLTextAreaElement>('output'),
  blocks: $('blocks'),
  translate: $<HTMLButtonElement>('translate'),
  translateAll: $<HTMLButtonElement>('translate-all'),
  stop: $<HTMLButtonElement>('stop'),
  copy: $<HTMLButtonElement>('copy'),
  download: $<HTMLButtonElement>('download'),
  status: $('status'),
  meter: $<HTMLProgressElement>('meter'),
  onlyFlagged: $<HTMLInputElement>('only-flagged'),
  onlyFlaggedText: $('only-flagged-text'),
  follow: $<HTMLButtonElement>('follow'),
  dialog: $<HTMLDialogElement>('settings'),
  form: $<HTMLFormElement>('settings-form'),
  connection: $('connection'),
  settingsError: $('settings-error'),
  examplesLabel: $('examples-label'),
}
const viewTabs = [...document.querySelectorAll<HTMLButtonElement>('.views [data-view]')]
const viewPanes = [...document.querySelectorAll<HTMLElement>('section.view')]

const storage: Pick<Storage, 'getItem' | 'setItem'> = (() => {
  try {
    return window.localStorage
  } catch {
    return { getItem: () => null, setItem: () => {} }
  }
})()

let settings: Settings = loadSettings(storage)
const docs: Doc[] = loadDocs(storage).map((d) => ({ ...d, view: d.units?.length ? 'blocks' : 'source' }))
let nextId = Math.max(0, ...docs.map((d) => d.id)) + 1
const blank = (): Doc => ({ id: nextId++, name: 'Untitled', source: '', status: 'idle', view: 'source' })
if (!docs.length) docs.push(blank())
let current = docs[0].id
let controller: AbortController | null = null

const doc = () => docs.find((d) => d.id === current)!
const busy = () => controller !== null

// ---- saving ---------------------------------------------------------------

let saveTimer = 0
function persist() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const ok = saveDocs(storage, docs.map(({ view, error, ...d }) => d))
    if (!ok) console.warn('Documents could not be saved in this browser.')
  }, 800)
}

// ---- rendering ------------------------------------------------------------

let frame = 0
function schedule() {
  if (!frame) frame = requestAnimationFrame(() => ((frame = 0), render()))
}

const blocks = new BlockList(el.blocks, {
  retry: (i) => retry(i),
  edit: (i, text) => {
    const d = doc()
    if (!d.units) return
    editUnit(d.source, d.units, i, text, LANGUAGES[d.lang ?? settings.language])
    persist()
    render()
  },
})

function render() {
  const d = doc()
  const units = d.units ?? []
  const md = units.length ? progressOf(d.source, units).markdown : ''
  const running = d.status === 'running'

  if (document.activeElement !== el.source && el.source.value !== d.source) el.source.value = d.source
  el.source.readOnly = running
  if (el.output.value !== md) el.output.value = md
  el.output.lang = units.length ? (d.lang ?? '') : ''
  el.output.dir = dirOf(units.length ? d.lang : undefined)

  el.docs.replaceChildren(...(docs.length > 1 || d.name !== 'Untitled' ? docs.map(docTab) : []))

  for (const t of viewTabs) {
    t.setAttribute('aria-selected', String(t.dataset.view === d.view))
    t.disabled = t.dataset.view !== 'source' && !units.length
  }
  for (const p of viewPanes) p.hidden = p.dataset.view !== d.view

  const isBusy = busy()
  el.translate.hidden = isBusy
  el.translate.disabled = !d.source.trim()
  el.translate.textContent = d.status === 'stopped' && units.some((u) => u.status === 'done') ? 'Resume' : units.length ? 'Translate again' : 'Translate'
  el.translateAll.hidden = isBusy || docs.filter((x) => x.source.trim()).length < 2
  el.stop.hidden = !isBusy
  el.copy.disabled = el.download.disabled = !md || running

  const flagged = units.filter((u) => u.status === 'done' && u.flags.length).length
  el.onlyFlagged.parentElement!.hidden = !flagged || d.view !== 'blocks'
  el.onlyFlaggedText.textContent = `Show only the ${flagged} to check`
  if (!flagged) el.onlyFlagged.checked = false

  const done = units.filter((u) => u.status === 'done').length
  el.meter.hidden = !running
  el.meter.max = Math.max(1, units.length)
  el.meter.value = done
  el.status.classList.toggle('error', d.status === 'error')
  el.status.textContent = statusLine(d, done, flagged)

  if (d.view === 'blocks' && units.length) blocks.show(units, d.lang ?? settings.language, isBusy, el.onlyFlagged.checked)
  el.follow.hidden = !(running && d.view === 'blocks' && !blocks.follow)
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
    x.title = `Remove ${d.name}`
    x.onclick = (e) => {
      e.stopPropagation()
      if (d.status === 'running') return
      docs.splice(docs.indexOf(d), 1)
      if (current === d.id) current = docs[0].id
      persist()
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

function statusLine(d: Doc, done: number, flagged: number): string {
  const total = d.units?.length ?? 0
  const check = flagged ? ` · ${flagged} to check` : ''
  switch (d.status) {
    case 'idle':
      return d.source.trim() ? 'Ready.' : 'Nothing translated yet.'
    case 'running':
      return total ? `Translating block ${Math.min(done + 1, total)} of ${total}${check}` : 'Starting…'
    case 'done':
      return total ? `Done${d.seconds !== undefined ? ` in ${d.seconds} s` : ''} · ${total} blocks${check}` : 'Nothing in this document needs translating.'
    case 'stopped':
      return `Stopped after ${done} of ${total} blocks${check}. Resume to continue; the rest is not translated yet.`
    case 'error':
      return d.error ?? 'Something went wrong.'
  }
}

// ---- translation ----------------------------------------------------------

function explain(e: unknown): string {
  if (e instanceof TypeError)
    return `Could not reach ${settings.endpoint}. Check that the model server is running and allows requests from this page. If Chrome asks to allow access to devices on your network, allow it.`
  return `The model server answered with an error: ${e instanceof Error ? e.message : String(e)}`
}

async function translate(targets: Doc[]) {
  controller = new AbortController()
  const complete = createClient({ endpoint: settings.endpoint, model: settings.model })
  const opts = toOptions(settings)
  for (const d of targets) {
    if (controller.signal.aborted) break
    const resume = d.status === 'stopped' ? d.units : undefined
    if (!resume || d.lang !== opts.language.code) d.units = undefined
    d.status = 'running'
    d.lang = opts.language.code
    d.error = undefined
    d.view = 'blocks'
    blocks.follow = true
    const started = performance.now()
    render()
    let finished = 0
    try {
      await translateDocument(
        d.source,
        opts,
        complete,
        (p) => {
          d.units = p.units
          const n = p.units.filter((u) => u.status === 'done').length
          if (n !== finished) ((finished = n), persist())
          schedule()
        },
        controller.signal,
        d.units,
      )
      d.status = 'done'
      d.seconds = Math.round((performance.now() - started) / 1000)
    } catch (e) {
      if (controller.signal.aborted) d.status = 'stopped'
      else {
        d.status = 'error'
        d.error = explain(e)
        break
      }
    } finally {
      d.units?.forEach((u) => u.status === 'running' && (u.status = 'waiting'))
      persist()
    }
    render()
  }
  controller = null
  render()
}

async function retry(i: number) {
  const d = doc()
  if (!d.units || busy()) return
  controller = new AbortController()
  const complete = createClient({ endpoint: settings.endpoint, model: settings.model })
  const opts = { ...toOptions(settings), language: LANGUAGES[d.lang ?? settings.language] }
  opts.examples = settings.examples[opts.language.code] ?? opts.language.examples
  render()
  try {
    await retryUnit(d.source, d.units, i, opts, complete, schedule, controller.signal)
  } catch (e) {
    if (!controller.signal.aborted) {
      d.error = explain(e)
      el.status.textContent = d.error
    }
  }
  controller = null
  persist()
  render()
}

// ---- documents ------------------------------------------------------------

async function addFiles(files: FileList | File[]) {
  const list = [...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) || f.type.startsWith('text/'))
  if (!list.length) return
  // An untouched empty document is replaced, not kept beside the new ones.
  if (docs.length === 1 && !docs[0].source.trim() && docs[0].status === 'idle') docs.length = 0
  for (const f of list) docs.push({ id: nextId++, name: f.name, source: await f.text(), status: 'idle', view: 'source' })
  current = docs[docs.length - list.length].id
  persist()
  render()
}

el.source.addEventListener('input', () => {
  const d = doc()
  if (d.status === 'running') return
  d.source = el.source.value
  d.status = 'idle'
  d.units = undefined
  persist()
  render()
})
el.source.addEventListener('paste', () => {
  // A pasted document is named by its first heading, so tabs stay legible.
  queueMicrotask(() => {
    const d = doc()
    const heading = d.source.match(/^#{1,6}\s+(.+)$/m)?.[1]
    if (d.name === 'Untitled' && heading) {
      d.name = heading.trim()
      persist()
      render()
    }
  })
})

$('new-doc').onclick = () => {
  docs.push(blank())
  current = docs[docs.length - 1].id
  render()
  el.source.focus()
}
$('add-files').onclick = () => el.file.click()
el.file.onchange = () => {
  if (el.file.files) addFiles(el.file.files)
  el.file.value = ''
}
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  document.body.classList.add('dropping')
})
for (const type of ['dragleave', 'drop']) document.addEventListener(type, () => document.body.classList.remove('dropping'))
document.addEventListener('drop', (e) => {
  e.preventDefault()
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files)
})

for (const t of viewTabs)
  t.onclick = () => {
    doc().view = t.dataset.view as View
    render()
  }
el.onlyFlagged.onchange = () => render()
el.follow.onclick = () => {
  blocks.follow = true
  render()
}
for (const ev of ['wheel', 'touchmove', 'keydown']) el.blocks.addEventListener(ev, schedule, { passive: true })

el.translate.onclick = () => translate([doc()])
el.translateAll.onclick = () => translate(docs.filter((d) => d.source.trim() && d.status !== 'running'))
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
  field('examples').value = formatExamples(s.examples[lang.code] ?? lang.examples, lang)
  field('skipKeys').value = s.skipKeys
  el.examplesLabel.textContent = `Examples (${lang.from} → ${lang.name})`
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
    const examples = parseExamples(field('examples').value, lang)
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

