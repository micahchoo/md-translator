// The aligned view: one row per unit, English beside its translation. Rows are
// built once per run and patched while text streams in, so a long document
// does not rebuild hundreds of rows on every token.
import type { Flag } from './checks'
import { dirOf } from './languages'
import { unmask } from './segment'
import type { UnitResult } from './translate'

export const FLAG_TEXT: Record<Flag, string> = {
  empty: 'Nothing came back',
  untranslated: 'Not translated',
  script: 'Wrong script or letters',
  unrelated: 'Not a translation',
  meaning: 'Meaning may be reversed',
  language: 'Another language',
  partial: 'Partly untranslated',
  markup: 'Formatting changed',
  numbers: 'Numbers changed',
  short: 'May be missing text',
  long: 'May have added text',
  truncated: 'Cut off',
  form: 'Odd form',
}

export interface BlockHandlers {
  retry(index: number): void
  edit(index: number, text: string): void
  /** Plays a block, or stops it if it is the one playing. */
  play(index: number): void
}

interface Row {
  el: HTMLElement
  key: string
}

/** Where the language has a voice: which block is playing, if any. */
export interface Listening {
  playing: number | null
  /** The voice is still downloading or reading, so nothing is heard yet. */
  loading: boolean
  /** How much of the voice has downloaded, 0 to 1, while it downloads. */
  progress?: number
  /** The language whose pronunciation is borrowed, when it is not this one's. */
  accent?: string
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export class BlockList {
  private rows: Row[] = []
  private units: UnitResult[] | null = null
  private editing: number | null = null
  private listening?: Listening
  /** Keep the running block in view; off as soon as the owner scrolls. */
  follow = true

  constructor(
    private readonly root: HTMLElement,
    private readonly handlers: BlockHandlers,
  ) {
    const stopFollowing = () => (this.follow = false)
    for (const ev of ['wheel', 'touchmove']) root.addEventListener(ev, stopFollowing, { passive: true })
    root.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) stopFollowing()
    })
  }

  /** `listening` is absent where the language has no voice. */
  show(units: UnitResult[], lang: string, busy: boolean, onlyFlagged: boolean, listening?: Listening) {
    this.listening = listening
    if (units !== this.units || this.rows.length !== units.length) {
      this.units = units
      this.editing = null
      this.rows = units.map(() => ({ el: h('article', 'block'), key: '' }))
      this.root.replaceChildren(...this.rows.map((r) => r.el))
    }
    let running: HTMLElement | null = null
    units.forEach((u, i) => {
      const row = this.rows[i]
      const hidden = onlyFlagged && !u.flags.length && u.status !== 'running'
      row.el.hidden = hidden
      if (u.status === 'running') running = row.el
      const key = [u.status, u.output, u.flags.join(), u.edited, busy, lang, this.editing === i, this.playLabel(i)].join('\u0000')
      if (key === row.key) return
      row.key = key
      this.fill(row.el, u, i, lang, busy)
    })
    if (running && this.follow) (running as HTMLElement).scrollIntoView({ block: 'nearest' })
  }

  private fill(el: HTMLElement, u: UnitResult, i: number, lang: string, busy: boolean) {
    el.className = `block is-${u.status}${u.flags.length ? ' is-flagged' : ''}`
    const head = h('header', 'block-head')
    head.append(h('span', 'num', String(i + 1)))
    if (u.unit.kind === 'value') head.append(h('span', 'tag', 'Property'))
    if (u.edited) head.append(h('span', 'tag', 'Edited'))
    if (u.flags.length) head.append(h('span', 'tag warn', u.flags.map((f) => FLAG_TEXT[f]).join(' · ')))
    head.append(h('span', 'spacer'))
    if (u.status === 'done' && this.editing !== i) {
      const retry = h('button', 'small ghost', 'Retry')
      retry.type = 'button'
      retry.disabled = busy
      retry.title = 'Ask the model again for this block'
      retry.onclick = () => this.handlers.retry(i)
      const edit = h('button', 'small ghost', 'Edit')
      edit.type = 'button'
      edit.disabled = busy
      edit.onclick = () => {
        this.editing = i
        this.fill(el, u, i, lang, busy)
        el.querySelector('textarea')?.focus()
      }
      head.append(retry, edit)
      const label = this.playLabel(i)
      if (label) {
        const accent = this.listening?.accent
        if (accent) head.append(h('span', 'tag', `${accent} pronunciation`))
        const play = h('button', 'small ghost', label)
        play.type = 'button'
        play.title = label !== 'Play' ? 'Stop reading' : accent ? `Read with ${accent} pronunciation` : 'Read this translation aloud'
        play.onclick = () => this.handlers.play(i)
        head.append(play)
      }
    }

    const source = h('div', 'cell source', unmask(u.unit.text, u.unit.restore))
    // Into English the source may be any language; let the browser read it.
    source.lang = lang === 'en' ? '' : 'en'
    source.dir = lang === 'en' ? 'auto' : 'ltr'
    let target: HTMLElement
    if (this.editing === i) {
      target = this.editor(u, i, lang)
    } else if (u.output) {
      target = h('div', 'cell target indic-text', unmask(u.output, u.unit.restore))
      target.lang = lang
      target.dir = dirOf(lang)
    } else {
      target = h('div', 'cell target pending', u.status === 'running' ? 'Translating…' : 'Waiting')
    }
    el.replaceChildren(head, source, target)
  }

  private playLabel(i: number): string | undefined {
    const l = this.listening
    if (!l || this.units?.[i].status !== 'done' || !this.units[i].output) return undefined
    if (l.playing !== i) return 'Play'
    if (!l.loading) return 'Stop'
    return l.progress === undefined ? 'Loading…' : `Voice ${Math.round(l.progress * 100)}%`
  }

  private editor(u: UnitResult, i: number, lang: string): HTMLElement {
    const box = h('div', 'cell target editing')
    const area = h('textarea', 'indic-text')
    area.lang = lang
    area.dir = dirOf(lang)
    // The owner edits what the model saw: link targets stay masked as #n.
    area.value = u.output
    area.rows = Math.max(2, Math.ceil(u.output.length / 60))
    const save = h('button', 'small primary', 'Save')
    save.type = 'button'
    const cancel = h('button', 'small ghost', 'Cancel')
    cancel.type = 'button'
    const done = (keep: boolean) => {
      this.editing = null
      this.rows[i].key = ''
      if (keep) this.handlers.edit(i, area.value)
      else this.fill(this.rows[i].el, u, i, lang, false)
    }
    save.onclick = () => done(true)
    cancel.onclick = () => done(false)
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(true)
      if (e.key === 'Escape') done(false)
    })
    const actions = h('div', 'row')
    actions.append(save, cancel, h('span', 'hint', 'Links show as #1, #2: keep them · Ctrl+Enter saves · Esc cancels'))
    box.append(area, actions)
    return box
  }
}
