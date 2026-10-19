import type { WriteQueue } from './storage/atomic-write'

type BeforeQuitListener = (e: { preventDefault(): void }) => void

/** The slice of Electron's `App` we use, so tests need no `electron` import. */
export type QuitApp = {
  on(event: 'before-quit', listener: BeforeQuitListener): unknown
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
}
