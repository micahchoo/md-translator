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
