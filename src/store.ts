// Documents and their finished blocks are kept in this browser, so a reload in
// the middle of a long run loses nothing and the run can be resumed.
import type { UnitResult } from './translate'

export interface SavedDoc {
  id: number
  name: string
  source: string
  status: 'idle' | 'running' | 'done' | 'stopped' | 'error'
  lang?: string
  seconds?: number
  units?: UnitResult[]
  /** The blocks of the run before the source was edited, kept for the next run to reuse. */
  previous?: UnitResult[]
  /** Set when the source was read from an image: the language it was read in,
   *  and whether English was read too. The image itself is not kept. */
  ocr?: { lang: string; english?: boolean }
}

const KEY = 'md-translator.docs'

export function loadDocs(storage: Pick<Storage, 'getItem'>): SavedDoc[] {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((d) => d && typeof d.source === 'string' && typeof d.id === 'number' && typeof d.name === 'string')
      .map((d: SavedDoc) => (d.status === 'running' ? { ...d, status: 'stopped' } : d))
  } catch {
    return []
  }
}

export function saveDocs(storage: Pick<Storage, 'setItem'>, docs: SavedDoc[]): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(docs))
    return true
  } catch {
    return false
  }
}

// The owner's edits, by language and then by source block, so the same sentence
// is never asked of the model again once the owner has said what it should be.
// Anuvaad keeps a translation memory for the same reason.
export type Memory = Record<string, Record<string, string>>

const MEMORY_KEY = 'md-translator.memory'

export function loadMemory(storage: Pick<Storage, 'getItem'>): Memory {
  try {
    const raw = JSON.parse(storage.getItem(MEMORY_KEY) ?? '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

export function saveMemory(storage: Pick<Storage, 'setItem'>, memory: Memory): boolean {
  try {
    storage.setItem(MEMORY_KEY, JSON.stringify(memory))
    return true
  } catch {
    return false
  }
}

export const remember = (memory: Memory, lang: string, source: string, text: string): Memory => ({
  ...memory,
  [lang]: { ...memory[lang], [source]: text },
})
