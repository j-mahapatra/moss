import type { WriteQueue } from './storage/atomic-write'

type QuitListener = (e: { preventDefault(): void }) => void

/** The slice of Electron's `App` we use, so tests need no `electron` import. */
export type QuitApp = {
  on(event: 'before-quit' | 'will-quit', listener: QuitListener): unknown
  quit(): void
}

/**
 * On the first `before-quit`, holds the quit until queued writes finish (or the timeout),
 * runs `onDrained`, then quits for real. Later `before-quit` events pass through.
 */
export function installQuitDrain(
  app: QuitApp,
  queue: WriteQueue,
  { timeoutMs = 2000, onDrained }: { timeoutMs?: number; onDrained?: () => void } = {}
): void {
  let draining = false
  let done = false
  let settled = false
  app.on('before-quit', (e) => {
    if (done) return
    e.preventDefault()
    if (draining) return
    draining = true
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // One budget for both waits: the second race reuses the same timeout promise.
        const timeout = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        })
        try {
          await Promise.race([queue.idle(), timeout])
        } finally {
          try {
            onDrained?.()
          } catch {
            // quitting must proceed even if cleanup fails
          }
        }
        // onDrained may enqueue work (e.g. history for sends cut short by dispose).
        await Promise.race([queue.idle(), timeout])
      } finally {
        clearTimeout(timer)
        done = true
        app.quit()
      }
    })()
  })
  // Windows close after the drain above, and a renderer's `beforeunload` flush reaches main
  // only then. Hold the final quit once more until that last write has landed.
  app.on('will-quit', (e) => {
    if (settled) return
    e.preventDefault()
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // Let IPC messages already received by main enqueue their writes first.
        await new Promise<void>((resolve) => setImmediate(resolve))
        await Promise.race([
          queue.idle(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs)
          })
        ])
      } finally {
        clearTimeout(timer)
        settled = true
        app.quit()
      }
    })()
  })
}
