// ONNX Runtime runs in a worker of its own (src/onnx.worker.ts), for the layout
// model and the voices. In the page, its WebAssembly memory would never shrink:
// one voice held 225 MB until the tab closed. The worker is ended when idle,
// which gives all of it back (src/idle.ts).
import { IDLE_MS, idleRelease } from './idle'

/** One input tensor, as the worker builds it. */
export interface Feed {
  type: 'float32' | 'int64'
  data: Float32Array | BigInt64Array
  dims: number[]
}

/** A model's bytes, or the URL the worker fetches it from. */
export type ModelSource = ArrayBuffer | string

/** What the worker is asked: run `key`'s model, sent along the first time. */
export interface ModelRequest {
  id: number
  key: string
  model?: ModelSource
  feeds: Record<string, Feed>
}

/** The worker's answer: the model's first output, or why it failed. */
export interface ModelReply {
  id: number
  data?: Float32Array
  error?: string
}

/** The part of a Worker the runner uses, so a test can stand in for it. */
export interface ModelWorker {
  postMessage(message: ModelRequest, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((e: MessageEvent<ModelReply>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

export function modelRunner(spawn: () => ModelWorker, idleMs = IDLE_MS) {
  let worker: ModelWorker | null = null
  /** The models the current worker has been sent. */
  let loaded = new Set<string>()
  const waiting = new Map<number, { key: string; resolve: (d: Float32Array) => void; reject: (e: Error) => void }>()
  let next = 0

  function release(): void {
    worker?.terminate()
    worker = null
    loaded = new Set()
    for (const w of waiting.values()) w.reject(new Error('The model was released.'))
    waiting.clear()
  }
  const idle = idleRelease(idleMs, release)

  function live(): ModelWorker {
    if (worker) return worker
    const w = spawn()
    w.onmessage = ({ data: { id, data, error } }) => {
      const job = waiting.get(id)
      if (!job) return
      waiting.delete(id)
      if (data) return job.resolve(data)
      // The worker drops a model that failed; send it again next time.
      loaded.delete(job.key)
      job.reject(new Error(error ?? 'The model gave no output.'))
    }
    w.onerror = (e) => {
      e.preventDefault?.()
      release()
    }
    return (worker = w)
  }

  return {
    /** Runs `key`'s model on `feeds` and gives its first output; `model` is called only when the worker lacks it. */
    run(key: string, model: () => Promise<ModelSource>, feeds: Record<string, Feed>): Promise<Float32Array> {
      return idle.run(async () => {
        const w = live()
        const source = loaded.has(key) ? undefined : await model()
        if (worker !== w) throw new Error('The model was released.')
        loaded.add(key)
        const id = next++
        return new Promise<Float32Array>((resolve, reject) => {
          waiting.set(id, { key, resolve, reject })
          w.postMessage({ id, key, model: source, feeds }, source instanceof ArrayBuffer ? [source] : [])
        })
      })
    },
    /** Ends the worker now, giving its memory back. */
    release,
  }
}

/** The page's one runner. */
export const models = modelRunner(() => new Worker(new URL('./onnx.worker.ts', import.meta.url), { type: 'module' }))
