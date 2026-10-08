import { expect, test } from 'bun:test'
import { loadKey, saveKey } from '../src/key'

function store() {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
}
const SARVAM = 'https://api.sarvam.ai/v1'

test('by default the key is kept for this tab only', () => {
  const tab = store(), device = store()
  saveKey({ tab, device }, SARVAM, 'sk-1', false)
  expect(loadKey({ tab, device }, SARVAM)).toEqual({ key: 'sk-1', remembered: false })
  expect(device.data.size).toBe(0)
  expect(loadKey({ tab: store(), device }, SARVAM)).toEqual({ key: '', remembered: false })
})

test('remembered, it is kept on the device too; unticked again, the device copy goes', () => {
  const tab = store(), device = store()
  saveKey({ tab, device }, SARVAM, 'sk-1', true)
  expect(loadKey({ tab: store(), device }, SARVAM)).toEqual({ key: 'sk-1', remembered: true })
  saveKey({ tab, device }, SARVAM, 'sk-1', false)
  expect(device.data.size).toBe(0)
})

test('a key is given only to the address it was entered for', () => {
  const tab = store(), device = store()
  saveKey({ tab, device }, SARVAM, 'sk-1', true)
  expect(loadKey({ tab, device }, 'https://api.sarvam.ai/v2').key).toBe('sk-1')
  expect(loadKey({ tab, device }, 'https://evil.example/v1').key).toBe('')
  expect(loadKey({ tab, device }, 'http://localhost:8086').key).toBe('')
})

test('an empty key removes both copies', () => {
  const tab = store(), device = store()
  saveKey({ tab, device }, SARVAM, 'sk-1', true)
  saveKey({ tab, device }, SARVAM, '', true)
  expect(tab.data.size + device.data.size).toBe(0)
})

test('storage that is blocked or corrupt gives no key instead of a broken page', () => {
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
  expect(() => saveKey({ tab: broken, device: broken }, SARVAM, 'sk-1', true)).not.toThrow()
  expect(loadKey({ tab: broken, device: broken }, SARVAM)).toEqual({ key: '', remembered: false })
  const bad = store()
  bad.setItem('md-translator.key', '{not json')
  expect(loadKey({ tab: bad, device: store() }, SARVAM).key).toBe('')
})
