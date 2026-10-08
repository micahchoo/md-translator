// A loaded model holds hundreds of megabytes: a Tesseract worker with its
// language, or ONNX Runtime with a voice. WebAssembly memory never shrinks, so
// the only way to give it back is to end the worker. Each is ended once nothing
// has run on it for a while; the next job loads it again, in a few seconds.

/** Calls `release` when no job has run for `ms`; a job keeps it waiting. */
export function idleRelease(ms: number, release: () => void) {
  let active = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    async run<T>(job: () => Promise<T>): Promise<T> {
      active++
      clearTimeout(timer)
      try {
        return await job()
      } finally {
        if (--active === 0) timer = setTimeout(release, ms)
      }
    },
  }
}

/** How long a loaded model waits unused before its memory is given back. */
export const IDLE_MS = 60_000
