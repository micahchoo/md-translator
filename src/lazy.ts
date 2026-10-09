// Something large that loads only when asked for, one key at a time: a
// language's romanizer tables (src/latin.ts), its deromanizer tables
// (src/typed.ts), the typed-text detector (src/detect.ts). A page that renders
// from its state asks `get` on every render: the first ask starts the load,
// and once it has settled nothing more is asked, so the render a settled load
// triggers cannot start another load, without end. Only the key asked for
// last is kept: a language's tables take tens of megabytes of heap parsed.

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

export interface OnDemand<T> {
  /** The value for `key` when it is here; otherwise undefined, and the load starts unless it has failed. */
  get(key: string): T | undefined
  /** The value for `key`, loaded now if it is not here. A failure is thrown, and remembered for `get`. */
  load(key: string): Promise<T>
  state(key: string): LoadState
  /** Forgets failures: the next `get` tries again. */
  retry(): void
}

/** `settled` is called after every load ends, however it ends, so a page can render the outcome. */
export function onDemand<T>(load: (key: string) => Promise<T>, settled: () => void = () => {}): OnDemand<T> {
  let ready: { key: string; value: T } | null = null
  const loading = new Map<string, Promise<T>>()
  const failed = new Set<string>()
  /** The key asked for last; an answer for any other key is a late one, and is dropped. */
  let wanted = ''

  function start(key: string): Promise<T> {
    const p = load(key).then(
      (value) => {
        failed.delete(key)
        if (wanted === key) ready = { key, value }
        return value
      },
      (e) => {
        failed.add(key)
        throw e
      },
    )
    loading.set(key, p)
    p.finally(() => {
      if (loading.get(key) === p) loading.delete(key)
      settled()
    }).catch(() => {})
    return p
  }

  return {
    get(key) {
      wanted = key
      if (ready?.key === key) return ready.value
      if (!failed.has(key) && !loading.has(key)) start(key)
      return undefined
    },
    load(key) {
      wanted = key
      if (ready?.key === key) return Promise.resolve(ready.value)
      return loading.get(key) ?? start(key)
    },
    state(key) {
      return ready?.key === key ? 'ready' : loading.has(key) ? 'loading' : failed.has(key) ? 'failed' : 'idle'
    },
    retry() {
      failed.clear()
    },
  }
}
