import { expect, test } from 'bun:test'
import { modelRunner, type ModelWorker } from '../src/onnx'

/** A worker that answers each run with [1, 2], or fails when told to. */
function fakes() {
  const spawned: { sent: { key: string; model?: unknown }[]; ended: boolean }[] = []
  let fail = false
  const spawn = (): ModelWorker => {
    const me = { sent: [] as { key: string; model?: unknown }[], ended: false }
    spawned.push(me)
    const w: ModelWorker = {
      onmessage: null,
      onerror: null,
      postMessage(q: { id: number; key: string; model?: unknown }) {
        me.sent.push({ key: q.key, model: q.model })
        const reply = fail ? { id: q.id, error: 'broken model' } : { id: q.id, data: Float32Array.from([1, 2]) }
        queueMicrotask(() => w.onmessage?.({ data: reply } as MessageEvent))
      },
      terminate() {
        me.ended = true
      },
    }
    return w
  }
  return { spawned, spawn, failNext: (f: boolean) => (fail = f) }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const model = async () => new ArrayBuffer(8)

test('a model goes to the worker once; later runs send only the inputs', async () => {
  const f = fakes()
  const r = modelRunner(f.spawn, 1000)
  expect(await r.run('voice', model, {})).toEqual(Float32Array.from([1, 2]))
  await r.run('voice', model, {})
  expect(f.spawned).toHaveLength(1)
  expect(f.spawned[0].sent.map((s) => s.model !== undefined)).toEqual([true, false])
})

test('idle, the worker is ended; the next run starts a new one and sends the model again', async () => {
  const f = fakes()
  const r = modelRunner(f.spawn, 20)
  await r.run('voice', model, {})
  await wait(40)
  expect(f.spawned[0].ended).toBe(true)
  await r.run('voice', model, {})
  expect(f.spawned).toHaveLength(2)
  expect(f.spawned[1].sent[0].model).toBeDefined()
})

test('a failed run rejects, and the next run sends the model again', async () => {
  const f = fakes()
  const r = modelRunner(f.spawn, 1000)
  f.failNext(true)
  await expect(r.run('voice', model, {})).rejects.toThrow('broken model')
  f.failNext(false)
  await r.run('voice', model, {})
  expect(f.spawned[0].sent.map((s) => s.model !== undefined)).toEqual([true, true])
})

test('release ends the worker at once and fails a run still waiting', async () => {
  const f = fakes()
  const r = modelRunner(f.spawn, 1000)
  await r.run('voice', model, {})
  const slow = r.run('layout', () => wait(20).then(() => 'model.onnx'), {})
  r.release()
  expect(f.spawned[0].ended).toBe(true)
  await expect(slow).rejects.toThrow()
})
