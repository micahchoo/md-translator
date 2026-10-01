import { describe, expect, test } from 'bun:test'
import { loadDocs, saveDocs, type SavedDoc } from '../src/store'

function memory() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

const doc: SavedDoc = { id: 3, name: 'Pickle.md', source: '# Pickle\n', status: 'done', lang: 'kn', seconds: 4, units: [] }

describe('documents survive a reload', () => {
  test('what is saved comes back', () => {
    const s = memory()
    expect(saveDocs(s, [doc])).toBe(true)
    expect(loadDocs(s)).toEqual([doc])
  })

  test('a run cut off by the reload comes back stopped, ready to resume', () => {
    const s = memory()
    saveDocs(s, [{ ...doc, status: 'running' }])
    expect(loadDocs(s)[0].status).toBe('stopped')
  })

  test('corrupt or blocked storage gives no documents, never a broken page', () => {
    const s = memory()
    s.data.set('md-translator.docs', '{nope')
    expect(loadDocs(s)).toEqual([])
    expect(loadDocs({ getItem: () => { throw new Error('blocked') } })).toEqual([])
    expect(saveDocs({ setItem: () => { throw new Error('full') } }, [doc])).toBe(false)
  })

  test('entries without a source are dropped', () => {
    const s = memory()
    s.data.set('md-translator.docs', JSON.stringify([{ id: 1, name: 'x' }, doc]))
    expect(loadDocs(s)).toEqual([doc])
  })
})
