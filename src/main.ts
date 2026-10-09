// The page: documents in, translations out. Every decision about the text
// lives in translate.ts and the modules under it; this file only shows state
// and turns clicks into calls.
import { BlockList } from './blocks'
import { directionLabel, dirOf, LANGUAGES } from './languages'
import { createScorer, probe, type Score } from './judge'
import { createClient, listModels } from './llm'
import { hasLatin, latinText, romanizer } from './latin'
import { imageLanguage, imageLanguages, readImage } from './ocr'
import { readPdf } from './pdf'
import { DEFAULTS, formatExamples, loadSettings, parseExamples, saveSettings, toOptions, type Settings } from './settings'
import type { Romanizer } from 'indickit/romanize'
import { downloadedBytes, removeDownloads } from './downloads'
import { loadKey, originOf, saveKey, type KeyStores } from './key'
import { speak } from './speech'
import { loadDocs, loadMemory, remember, saveDocs, saveMemory, type SavedDoc } from './store'
import { editUnit, machineNote, progressOf, retryUnit, sourceLanguage, translateDocument, type TranslateOptions } from './translate'
import { deromanizer, hasTyped, typedText } from './typed'
import { detector, looksTyped, type Model } from './detect'

type View = 'source' | 'blocks' | 'markdown'

interface Doc extends SavedDoc {
  view: View
  error?: string
  /** What the image's reading is doing, while it reads. */
  reading?: string
  /** The image is shown beside its text. */
  showImage?: boolean
  /** An image waiting for the owner to name its language and press Read. */
  unread?: boolean
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
  latin: $<HTMLInputElement>('latin'),
  latinText: $('latin-text'),
  typed: $<HTMLInputElement>('typed'),
  typedText: $('typed-text'),
  typedLang: $<HTMLSelectElement>('typed-lang'),
  typedHint: $('typed-hint'),
  typedHintLang: $('typed-hint-lang'),
  typedHintUse: $<HTMLButtonElement>('typed-hint-use'),
  dialog: $<HTMLDialogElement>('settings'),
  form: $<HTMLFormElement>('settings-form'),
  connection: $('connection'),
  settingsError: $('settings-error'),
  examplesLabel: $('examples-label'),
  reading: $('reading'),
  imageLang: $<HTMLSelectElement>('image-lang'),
  imageEnglish: $<HTMLInputElement>('image-english'),
  readImage: $<HTMLButtonElement>('read-image'),
  readingNote: $('reading-note'),
  showImage: $<HTMLButtonElement>('show-image'),
  image: $<HTMLImageElement>('image'),
  sourcePane: document.querySelector<HTMLElement>('.source-pane')!,
  removeDownloads: $<HTMLButtonElement>('remove-downloads'),
  downloadsSize: $('downloads-size'),
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
const noStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const keyStores: KeyStores = (() => {
  try {
    return { tab: window.sessionStorage, device: window.localStorage }
  } catch {
    return { tab: noStore, device: noStore }
  }
})()

let settings: Settings = loadSettings(storage)
/** The hosted model's key for the endpoint in use (src/key.ts); '' for a local server. */
let apiKey = loadKey(keyStores, settings.endpoint).key
let memory = loadMemory(storage)
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
    const ok = saveDocs(storage, docs.map(({ view, error, reading, showImage, unread, ...d }) => d))
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
  play: (i) => play(i),
  edit: (i, text) => {
    const d = doc()
    if (!d.units) return
    const lang = d.lang ?? settings.language
    editUnit(d.source, d.units, i, text, sourceLanguage({ language: LANGUAGES[lang], typed: typedOf(d.typed) }))
    memory = remember(memory, lang, d.units[i].unit.text, d.units[i].output)
    saveMemory(storage, memory)
    persist()
    render()
  },
})

function render() {
  stopIfStale()
  const d = doc()
  const units = d.units ?? []
  const md = units.length ? progressOf(d.source, units).markdown : ''
  const running = d.status === 'running'

  if (document.activeElement !== el.source && el.source.value !== d.source) el.source.value = d.source
  el.source.readOnly = running || !!d.reading
  el.source.lang = d.ocr?.lang ?? ''
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
  el.translate.disabled = !d.source.trim() || !!d.reading
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
  el.status.textContent = d.reading ?? (d.unread ? `Choose the language of the text in the ${isPdf(d) ? 'PDF' : 'image'}, then press Read.` : statusLine(d, done, flagged))
  renderReading(d)

  const lang = d.lang ?? settings.language
  const canLatin = d.view === 'blocks' && units.length > 0 && hasLatin(lang)
  const latin = settings.latin && canLatin ? latinFor(lang) : undefined
  el.latin.parentElement!.hidden = !canLatin
  el.latin.checked = settings.latin
  el.latinText.textContent =
    settings.latin && canLatin && !latin ? (latinFailed.has(lang) ? 'Latin letters could not load' : 'Latin letters: loading…') : 'Latin letters'
  renderTyped()
  const voice = LANGUAGES[lang].voice
  const mine = playing?.doc === d.id ? playing : null
  const listening = voice
    ? { playing: mine?.index ?? null, loading: !!mine?.loading, progress: mine?.progress, accent: voice.accent }
    : undefined
  if (d.view === 'blocks' && units.length) blocks.show(units, lang, isBusy, el.onlyFlagged.checked, listening, latin && ((t) => latinText(latin, t)))
  el.follow.hidden = !(running && d.view === 'blocks' && !blocks.follow)
}

// ---- a source typed in Latin letters ---------------------------------------

/** The languages a source can be typed in, for the select beside the source box. */
const typedChoices = Object.values(LANGUAGES).filter((l) => hasTyped(l.code))
el.typedLang.replaceChildren(...typedChoices.map((l) => new Option(l.name, l.code)))

const typedFailed = new Set<string>()
const typedLoading = new Set<string>()
/** The one language whose tables are here (src/typed.ts keeps one at a time). */
let typedReady: string | null = null

/** The typed language's tables, loading when first asked; a failed load shows and
 *  is tried again on the next tick. Once here, nothing more is asked: a settled
 *  promise's callback would render again, and that render ask again, without end. */
function typedFor(lang: string): void {
  if (typedReady === lang || typedFailed.has(lang) || typedLoading.has(lang)) return
  typedLoading.add(lang)
  deromanizer(lang)
    .then(
      () => (typedReady = lang),
      () => typedFailed.add(lang),
    )
    .finally(() => {
      typedLoading.delete(lang)
      render()
    })
}

/** The typed language this run's source is in, if it is typed and differs from the target. */
const typedCode = (target: string) => (settings.typed && settings.typed !== target && hasTyped(settings.typed) ? settings.typed : '')

/** The `typed` option for a document already run, with nothing left to convert: its label only. */
const typedOf = (code: string | undefined): TranslateOptions['typed'] => (code && hasTyped(code) ? { language: LANGUAGES[code], convert: (t) => t } : undefined)

/** The detector's model, fetched (50 KB) with the first source that is mostly Latin letters. */
let detectModel: Model | null | undefined
/** The last source looked at, and the language it looked typed in. */
let detected: { text: string; lang: string | null } = { text: '', lang: null }

/** The language a source looks typed in while the option is off (src/detect.ts):
 *  a guess the owner confirms with the button. Null while the model loads, for
 *  English, for text in a script, and when it would be the target itself. */
function suggested(): string | null {
  const d = doc()
  if (settings.typed || d.status === 'running' || d.ocr) return null
  if (d.source !== detected.text) {
    if (detectModel === undefined) {
      detectModel = null
      detector().then(
        (m) => ((detectModel = m), render()),
        () => {},
      )
    }
    detected = { text: d.source, lang: detectModel ? looksTyped(detectModel, d.source) : null }
  }
  return detected.lang && detected.lang !== settings.language ? detected.lang : null
}

function renderTyped() {
  const code = settings.typed
  el.typed.checked = !!code
  el.typedLang.hidden = !code
  if (code) {
    el.typedLang.value = code
    typedFor(code)
  }
  const hint = suggested()
  el.typedHint.hidden = !hint
  if (hint) {
    el.typedHintLang.textContent = LANGUAGES[hint].name
    el.typedHintUse.textContent = `Convert as ${LANGUAGES[hint].name}`
    el.typedHintUse.dataset.lang = hint
  }
  el.typedText.textContent = !code
    ? 'Typed in Latin letters'
    : typedFailed.has(code)
      ? 'Typed in Latin letters: the tables could not load'
      : typedLoading.has(code)
        ? 'Typed in Latin letters: loading…'
        : code === settings.language
          ? 'Typed in Latin letters: same as the target, so left as typed'
          : 'Typed in Latin letters'
}

el.typed.onchange = () => {
  // Ticked by hand: the language the source looks typed in, else the last chosen.
  settings.typed = el.typed.checked ? suggested() || el.typedLang.value || typedChoices[0].code : ''
  saveSettings(storage, settings)
  // Ticked again after a failed load: try once more.
  if (settings.typed) typedFailed.clear()
  render()
}
el.typedHintUse.onclick = () => {
  settings.typed = el.typedHintUse.dataset.lang ?? ''
  saveSettings(storage, settings)
  typedFailed.clear()
  render()
}
el.typedLang.onchange = () => {
  settings.typed = el.typedLang.value
  saveSettings(storage, settings)
  typedFailed.clear()
  render()
}

/** The one language whose romanizer is loaded (src/latin.ts keeps one at a time). */
let latinReady: { lang: string; r: Romanizer } | null = null
const latinFailed = new Set<string>()
const latinLoading = new Set<string>()
/** Counts loads asked for, so a late answer for a language left behind is dropped. */
let latinAsks = 0

/** The language's romanizer once loaded; until then it starts the load and renders again when it ends. */
function latinFor(lang: string): Romanizer | undefined {
  const ready = latinReady?.lang === lang ? latinReady.r : undefined
  if (ready || latinFailed.has(lang) || latinLoading.has(lang)) return ready
  latinLoading.add(lang)
  const ask = ++latinAsks
  romanizer(lang)
    .then(
      (r) => {
        if (ask === latinAsks) latinReady = { lang, r }
      },
      () => latinFailed.add(lang),
    )
    .finally(() => {
      latinLoading.delete(lang)
      render()
    })
  return undefined
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
      forgetImage(d.id)
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

// Whether the endpoint can score text for the judge, asked once per endpoint.
const scorable = new Map<string, Promise<boolean>>()
async function scorer(): Promise<Score | undefined> {
  if (!settings.judge) return undefined
  if (!scorable.has(settings.endpoint)) scorable.set(settings.endpoint, probe(settings.endpoint))
  return (await scorable.get(settings.endpoint)) ? createScorer(settings.endpoint) : undefined
}

async function translate(targets: Doc[]) {
  controller = new AbortController()
  const complete = createClient({ endpoint: settings.endpoint, model: settings.model, apiKey })
  const opts: TranslateOptions = { ...toOptions(settings), remembered: memory[settings.language], score: await scorer() }
  const typed = typedCode(opts.language.code)
  if (typed) {
    // The source is typed in Latin letters: its tables must be here before the first block.
    try {
      const d = await deromanizer(typed)
      opts.typed = { language: LANGUAGES[typed], convert: (t) => typedText(d, t) }
    } catch {
      typedFailed.add(typed)
      for (const d of targets) ((d.status = 'error'), (d.error = `The tables for ${LANGUAGES[typed].name} typed in Latin letters could not be downloaded. Check the connection, or untick "Typed in Latin letters".`))
      controller = null
      return render()
    }
  }
  for (const d of targets) {
    if (controller.signal.aborted) break
    // A stopped run resumes; an edited source keeps its unchanged blocks; the
    // same source asked again is translated again from nothing.
    const earlier = d.status === 'stopped' ? d.units : d.previous
    const resume = earlier && d.lang === opts.language.code && (d.typed ?? '') === typed ? earlier : undefined
    d.previous = undefined
    delete d.units // the run reports the carried-over blocks at once, at their new places
    d.status = 'running'
    d.lang = opts.language.code
    d.typed = typed || undefined
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
        resume,
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
  const complete = createClient({ endpoint: settings.endpoint, model: settings.model, apiKey })
  const opts: TranslateOptions = { ...toOptions(settings), language: LANGUAGES[d.lang ?? settings.language], score: await scorer(), typed: typedOf(d.typed) }
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

// ---- reading aloud ---------------------------------------------------------

// One block plays at a time. espeak-ng loads on the first Play, not with the page.
let playing: {
  doc: number
  index: number
  /** What is being read, and in which language: the audio belongs to these. */
  lang?: string
  output: string
  loading: boolean
  progress?: number
  audio?: HTMLAudioElement
} | null = null

// A run into another language, a Retry, an Edit or a removed document changes
// what the block says, and the audio stops with it. One rule, checked on every
// render, so a new way to change a block cannot forget to stop it.
function stopIfStale() {
  if (!playing) return
  const d = docs.find((x) => x.id === playing!.doc)
  if (!d || d.lang !== playing.lang || d.units?.[playing.index]?.output !== playing.output) stopPlaying()
}

function stopPlaying() {
  if (playing?.audio) {
    playing.audio.pause()
    URL.revokeObjectURL(playing.audio.src)
  }
  playing = null
}

async function play(i: number) {
  const d = doc()
  const voice = LANGUAGES[d.lang ?? settings.language].voice
  const again = playing?.doc === d.id && playing.index === i
  stopPlaying()
  const output = d.units?.[i]?.output
  if (again || !voice || !output) return render()
  const me: NonNullable<typeof playing> = { doc: d.id, index: i, lang: d.lang, output, loading: true }
  playing = me
  render()
  try {
    const wav = await speak(voice, output, (loaded, total) => {
      me.progress = total ? loaded / total : undefined
      schedule()
    })
    me.progress = undefined
    if (playing !== me) return // Stop, or another block, was pressed while it loaded
    if (!wav) return (stopPlaying(), render())
    me.audio = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })))
    me.audio.onended = () => {
      if (playing === me) stopPlaying()
      render()
    }
    await me.audio.play()
    me.loading = false
    showDownloads()
  } catch (e) {
    console.warn('Reading aloud failed:', e)
    if (playing === me) stopPlaying()
  }
  render()
}

// ---- documents ------------------------------------------------------------

const isImage = (f: File) => /^image\/(png|jpeg|webp)$/.test(f.type)
const isPdf = (f: { name: string; type?: string }) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

async function addFiles(files: FileList | File[]) {
  const list = [...files].filter((f) => isImage(f) || isPdf(f) || /\.(md|markdown|txt)$/i.test(f.name) || f.type.startsWith('text/'))
  if (!list.length) return
  // An untouched empty document is replaced, not kept beside the new ones.
  if (docs.length === 1 && !docs[0].source.trim() && docs[0].status === 'idle' && !docs[0].ocr) docs.length = 0
  const added: Doc[] = []
  for (const f of list) {
    const read = isImage(f) || isPdf(f)
    const d: Doc = { id: nextId++, name: f.name, source: read ? '' : await f.text(), status: 'idle', view: 'source' }
    if (read) {
      const lang = imageLanguage(settings.language, settings.imageLanguage, isPdf(f))
      const english = lang !== 'en' && settings.imageEnglish
      images.set(d.id, f)
      // The picture beside its text is how the owner checks a reading.
      Object.assign(d, { ocr: { lang, english }, showImage: isImage(f) })
      // From English the image is English and is read at once. Into English
      // its language is the owner's to name first: a reading in the wrong
      // one is a wait, a dialog and a second wait.
      if (lang !== 'en') d.unread = true
    }
    docs.push(d)
    added.push(d)
  }
  current = added[0].id
  persist()
  render()
  for (const d of added) if (images.has(d.id) && !d.unread) readInto(d, d.ocr!.lang, !!d.ocr!.english)
  if (added[0].unread) el.imageLang.focus()
}

// ---- reading images ---------------------------------------------------------

// Images live only as long as the page: the text read from them is the
// document, and localStorage could not hold them anyway.
const images = new Map<number, Blob>()
const imageUrls = new Map<number, string>()
/** The latest reading asked of each document; an older one that finishes late is dropped. */
const readings = new Map<number, number>()
/** The text each image's last reading gave, to tell whether the owner has changed it since. */
const lastRead = new Map<number, string>()

function forgetImage(id: number) {
  images.delete(id)
  readings.delete(id)
  lastRead.delete(id)
  const url = imageUrls.get(id)
  if (url) URL.revokeObjectURL(url)
  imageUrls.delete(id)
}

/** Tesseract's progress, in the owner's words. */
function readingStatus(status: string, lang: string, english: boolean): string {
  if (status.startsWith('recognizing')) return 'Reading the image…'
  return `Getting ${LANGUAGES[lang].name}${english ? ' and English' : ''} letters, once…`
}

async function readInto(d: Doc, lang: string, english: boolean) {
  const image = images.get(d.id)
  if (!image) return
  const me = (readings.get(d.id) ?? 0) + 1
  readings.set(d.id, me)
  const latest = () => readings.get(d.id) === me && docs.includes(d)
  d.unread = false
  // The controls show the reading under way, not the one before it.
  d.ocr = { lang, english }
  const pdf = isPdf(d)
  d.reading = pdf ? 'Opening the PDF…' : 'Reading the image…'
  render()
  try {
    let text: string
    if (pdf) {
      const r = await readPdf(image, lang, english, (status) => {
        if (!latest()) return
        d.reading = status
        schedule()
      })
      text = r.text
      d.ocr = { lang, english, pdf: { pages: r.pages, read: r.read, damaged: r.damaged } }
    } else
      text = await readImage(image, lang, english, (status) => {
        if (!latest()) return
        d.reading = readingStatus(status, lang, english)
        schedule()
      })
    if (!latest()) return
    if (d.units) d.previous = d.units
    d.units = undefined
    d.source = text
    lastRead.set(d.id, text)
    d.status = 'idle'
    d.error = undefined
  } catch (e) {
    if (!latest()) return
    d.status = 'error'
    d.error = `The ${pdf ? 'PDF' : 'image'} could not be read: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    if (readings.get(d.id) === me) d.reading = undefined
  }
  persist()
  render()
  showDownloads()
}

function renderReading(d: Doc) {
  el.reading.hidden = !d.ocr
  const image = images.get(d.id)
  el.sourcePane.classList.toggle('with-image', !!(d.ocr && image && d.showImage))
  el.image.hidden = !(d.ocr && image && d.showImage)
  if (!d.ocr) return
  // A PDF may be in any language: its text layer needs no reading.
  const choices = isPdf(d) ? Object.values(LANGUAGES) : imageLanguages()
  const label = (l: (typeof choices)[number]) => (!l.ocr ? `${l.name} (text only)` : l.ocr.borrowed ? `${l.name} (with ${l.ocr.borrowed} letters)` : l.name)
  if (el.imageLang.dataset.kind !== (isPdf(d) ? 'pdf' : 'image')) {
    el.imageLang.replaceChildren(...choices.map((l) => new Option(label(l), l.code)))
    el.imageLang.dataset.kind = isPdf(d) ? 'pdf' : 'image'
  }
  el.imageLang.value = d.ocr.lang
  el.imageLang.disabled = !image || !!d.reading
  el.imageEnglish.parentElement!.hidden = d.ocr.lang === 'en'
  el.imageEnglish.checked = !!d.ocr.english
  el.imageEnglish.disabled = el.imageLang.disabled
  el.imageEnglish.parentElement!.title = image
    ? 'Read English words too, for a page that mixes them in. Leave it off for a page in one language: it reads that language a little worse.'
    : 'The image is not kept after the page is reloaded'
  el.imageLang.title = !image ? 'The image is not kept after the page is reloaded' : d.unread ? 'The language of the text in the image' : 'Read the image again in another language'
  el.readImage.hidden = !d.unread
  el.readingNote.textContent = d.reading || d.unread ? '' : pdfNote(d)
  el.showImage.hidden = !image || isPdf(d)
  el.showImage.setAttribute('aria-pressed', String(!!d.showImage))
  el.showImage.textContent = d.showImage ? 'Hide image' : 'Show image'
  if (image && d.showImage && !imageUrls.has(d.id)) imageUrls.set(d.id, URL.createObjectURL(image))
  const url = imageUrls.get(d.id)
  if (url && el.image.src !== url) el.image.src = url
}

/** How a PDF's pages were read, and a warning where a damaged text layer had to stay. */
function pdfNote(d: Doc): string {
  const p = d.ocr?.pdf
  if (!p) return ''
  const pages = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`
  const fromText = p.pages - p.read
  const how = !p.read
    ? `${pages(p.pages)} from the PDF's text`
    : !fromText
      ? `${pages(p.pages)} read as ${p.read === 1 ? 'an image' : 'images'}: the PDF has no usable text`
      : `${pages(fromText)} from the PDF's text, ${pages(p.read)} read as ${p.read === 1 ? 'an image' : 'images'}`
  const name = LANGUAGES[d.ocr!.lang].name
  const warn = p.damaged ? ` · the text of ${p.damaged} ${p.damaged === 1 ? 'page looks' : 'pages looks'} damaged, and ${name} cannot be read from images: check it` : ''
  return how + warn
}

/** Reads the image again; asks first only when the owner has changed the text it gave. */
function readAgain(lang: string, english: boolean): boolean {
  const d = doc()
  const what = `${LANGUAGES[lang].name}${english ? ' with English' : ''}`
  const edited = d.source.trim() && d.source !== lastRead.get(d.id)
  if (edited && !confirm(`Read the image again as ${what}? Your changes to the text below are lost.`)) return false
  readInto(d, lang, english)
  return true
}

/** The image's language and English, remembered for the next image. */
function rememberReading(lang: string, english: boolean) {
  if (settings.language === 'en') settings.imageLanguage = lang
  if (lang !== 'en') settings.imageEnglish = english
  saveSettings(storage, settings)
}

el.imageLang.onchange = () => {
  const d = doc()
  const lang = el.imageLang.value
  const english = lang !== 'en' && !!d.ocr?.english
  // Before the first reading, a choice is only a choice; Read starts it.
  if (d.unread) d.ocr = { ...d.ocr!, lang }
  else if (!readAgain(lang, english)) return render()
  rememberReading(lang, english)
  render()
}
el.imageEnglish.onchange = () => {
  const d = doc()
  const english = el.imageEnglish.checked
  if (d.unread) d.ocr = { ...d.ocr!, english }
  else if (!readAgain(d.ocr!.lang, english)) return render()
  rememberReading(d.ocr!.lang, english)
  render()
}
el.readImage.onclick = () => {
  const d = doc()
  if (d.ocr) readInto(d, d.ocr.lang, !!d.ocr.english)
}
el.showImage.onclick = () => {
  const d = doc()
  d.showImage = !d.showImage
  render()
}

el.source.addEventListener('input', () => {
  const d = doc()
  if (d.status === 'running') return
  d.source = el.source.value
  d.status = 'idle'
  // Set aside, not discarded: their offsets no longer fit the text, so no view
  // may show them, but the next run keeps every block whose text is unchanged.
  if (d.units) d.previous = d.units
  d.units = undefined
  persist()
  render()
})
el.source.addEventListener('paste', (e) => {
  // A pasted image becomes a document of its own, read like an attached one.
  const pasted = [...(e.clipboardData?.files ?? [])].filter(isImage)
  if (pasted.length) {
    e.preventDefault()
    addFiles(pasted.map((f) => new File([f], `Pasted image.${f.type.split('/')[1]}`, { type: f.type })))
    return
  }
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
el.latin.onchange = () => {
  settings.latin = el.latin.checked
  saveSettings(storage, settings)
  // Ticked again after a failed load: try once more.
  if (settings.latin) latinFailed.clear()
  render()
}
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
  const base = d.name.replace(/\.(md|markdown|txt|png|jpe?g|webp|pdf)$/i, '') || 'translation'
  const a = document.createElement('a')
  const flagged = (d.units ?? []).filter((u) => u.flags.length).length
  const lang = sourceLanguage({ language: LANGUAGES[d.lang ?? settings.language], typed: typedOf(d.typed) })
  const note = settings.noteOnDownload ? `\n${machineNote(lang, settings.model, new Date().toISOString().slice(0, 10), flagged)}\n` : ''
  a.href = URL.createObjectURL(new Blob([el.output.value.replace(/\n*$/, '\n') + note], { type: 'text/markdown;charset=utf-8' }))
  a.download = `${base}.${d.lang ?? settings.language}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---- language and settings ------------------------------------------------

el.lang.replaceChildren(
  ...Object.values(LANGUAGES).map((l) => new Option(directionLabel(l), l.code, false, l.code === settings.language)),
)
el.lang.onchange = () => {
  settings.language = el.lang.value
  saveSettings(storage, settings)
}

const field = (name: string) => el.form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement

/** The address the key in the form belongs to. Changing the endpoint to
 *  another address clears the key, so it is never sent where it was not entered. */
let keyOrigin = ''
field('endpoint').addEventListener('input', () => {
  if (originOf(field('endpoint').value) !== keyOrigin) field('apiKey').value = ''
})
field('apiKey').addEventListener('input', () => (keyOrigin = originOf(field('endpoint').value)))

function fillForm(s: Settings) {
  const lang = LANGUAGES[s.language]
  field('endpoint').value = s.endpoint
  field('model').value = s.model
  const saved = loadKey(keyStores, s.endpoint)
  field('apiKey').value = saved.key
  ;(field('rememberKey') as HTMLInputElement).checked = saved.remembered
  keyOrigin = originOf(s.endpoint)
  field('passageLength').value = String(s.passageLength)
  field('contextBlocks').value = String(s.contextBlocks)
  field('retries').value = String(s.retries)
  field('preamble').value = s.preamble
  field('examples').value = formatExamples(s.examples[lang.code] ?? lang.examples, lang)
  field('skipKeys').value = s.skipKeys
  ;(field('noteOnDownload') as HTMLInputElement).checked = s.noteOnDownload
  ;(field('judge') as HTMLInputElement).checked = s.judge
  el.examplesLabel.textContent = `Examples (${directionLabel(lang)})`
  el.settingsError.textContent = ''
  el.connection.textContent = ''
}

/** The top bar's button shows what the page keeps in this browser, when it keeps anything. */
async function showDownloads() {
  const bytes = await downloadedBytes()
  el.downloadsSize.textContent = `(${Math.max(1, Math.round(bytes / 1e6))} MB)`
  el.removeDownloads.hidden = !bytes
}

$('open-settings').onclick = () => {
  fillForm(settings)
  el.dialog.showModal()
}
el.removeDownloads.onclick = async () => {
  if (!confirm(`Remove the voices and reading data kept in this browser ${el.downloadsSize.textContent}? Each downloads again when next needed.`)) return
  stopPlaying()
  render()
  el.removeDownloads.disabled = true
  await removeDownloads()
  el.removeDownloads.disabled = false
  showDownloads()
}
showDownloads()
$('reset-settings').onclick = () => fillForm({ ...structuredClone(DEFAULTS), language: settings.language })
$('test-connection').onclick = async () => {
  el.connection.textContent = 'Connecting…'
  try {
    const models = await listModels(field('endpoint').value, undefined, field('apiKey').value.trim())
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
      noteOnDownload: (field('noteOnDownload') as HTMLInputElement).checked,
      judge: (field('judge') as HTMLInputElement).checked,
    }
    apiKey = field('apiKey').value.trim()
    saveKey(keyStores, settings.endpoint, apiKey, (field('rememberKey') as HTMLInputElement).checked)
    if (!saveSettings(storage, settings)) el.settingsError.textContent = 'Saved for this visit only: this browser blocks storage.'
  } catch (err) {
    e.preventDefault()
    el.settingsError.textContent = (err as Error).message
  }
})

render()

