// ONNX Runtime's thread (src/onnx.ts). Each model is loaded once, under its
// key, and lives until the page ends this worker.
import * as ort from 'onnxruntime-web/wasm'
import type { ModelReply, ModelRequest } from './onnx'

const sessions = new Map<string, Promise<ort.InferenceSession>>()

self.onmessage = async ({ data: q }: MessageEvent<ModelRequest>) => {
  let reply: ModelReply
  try {
    let s = sessions.get(q.key)
    if (!s) {
      if (q.model === undefined) throw new Error(`${q.key} was never sent`)
      const options = { executionProviders: ['wasm'] }
      s = typeof q.model === 'string' ? ort.InferenceSession.create(q.model, options) : ort.InferenceSession.create(new Uint8Array(q.model), options)
      sessions.set(q.key, s)
    }
    const session = await s
    const feeds = Object.fromEntries(Object.entries(q.feeds).map(([name, f]) => [name, new ort.Tensor(f.type, f.data, f.dims)]))
    const out = await session.run(feeds)
    reply = { id: q.id, data: out[session.outputNames[0]].data as Float32Array }
  } catch (e) {
    sessions.delete(q.key)
    reply = { id: q.id, error: e instanceof Error ? e.message : String(e) }
  }
  self.postMessage(reply, reply.data ? [reply.data.buffer as ArrayBuffer] : [])
}
