import { describe, expect, test } from 'bun:test'
import { onDemand } from '../src/lazy'

/** A load that ends when the test says, counting its calls. */
function controlled() {
  const pending = new Map<string, { ok: (v: string) => void; fail: (e: Error) => void }>()
  const calls: string[] = []
  const load = (key: string) =>
    new Promise<string>((ok, fail) => {
      calls.push(key)
      pending.set(key, { ok, fail })
    })
  return { load, calls, ok: (k: string) => pending.get(k)!.ok(`${k}!`), fail: (k: string) => pending.get(k)!.fail(new Error('no')) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('onDemand', () => {
  test('the first ask starts the load, once; after it ends the value is there, settled was told, and nothing more is asked', async () => {
    const c = controlled()
    let settled = 0
    const tables = onDemand(c.load, () => settled++)
    expect(tables.get('hi')).toBeUndefined()
    expect(tables.get('hi')).toBeUndefined()
    expect(tables.state('hi')).toBe('loading')
    expect(c.calls).toEqual(['hi'])
    c.ok('hi')
    await tick()
    expect(tables.get('hi')).toBe('hi!')
    expect(tables.state('hi')).toBe('ready')
    expect(settled).toBe(1)
    expect(c.calls).toEqual(['hi'])
  })

  test('a failed load is thrown by load(), remembered by get() until retry, and settled is told', async () => {
    const c = controlled()
    let settled = 0
    const tables = onDemand(c.load, () => settled++)
    const p = tables.load('hi')
    c.fail('hi')
    await expect(p).rejects.toThrow('no')
    await tick()
    expect(settled).toBe(1)
    expect(tables.state('hi')).toBe('failed')
    expect(tables.get('hi')).toBeUndefined()
    expect(c.calls).toEqual(['hi'])
    tables.retry()
    expect(tables.get('hi')).toBeUndefined()
    expect(tables.state('hi')).toBe('loading')
    expect(c.calls).toEqual(['hi', 'hi'])
  })

  test('only the key asked for last is kept: a late answer for one left behind is dropped', async () => {
    const c = controlled()
    const tables = onDemand(c.load)
    tables.get('hi')
    tables.get('kn')
    c.ok('hi')
    await tick()
    expect(tables.state('hi')).toBe('idle')
    c.ok('kn')
    await tick()
    expect(tables.get('kn')).toBe('kn!')
    expect(tables.state('kn')).toBe('ready')
  })

  test('load() shares the load under way, and answers at once once the value is here', async () => {
    const c = controlled()
    const tables = onDemand(c.load)
    tables.get('hi')
    const p = tables.load('hi')
    expect(c.calls).toEqual(['hi'])
    c.ok('hi')
    expect(await p).toBe('hi!')
    expect(await tables.load('hi')).toBe('hi!')
    expect(c.calls).toEqual(['hi'])
  })
})
