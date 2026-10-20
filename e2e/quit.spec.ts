import { expect, test } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { launchApp } from './fixtures/app'

/** Resolves true once `child` has exited, or false if it is still running after `ms`. */
function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, ms)
    const onExit = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

// Electron's signal handler starts a quit that the write drain holds; the app must still exit
// (on macOS it used to stop at window-all-closed and idle forever).
test('SIGTERM quits the app within 5 seconds', async () => {
  const launched = await launchApp()
  const child = launched.app.process()
  try {
    child.kill('SIGTERM')
    expect(await waitForExit(child, 5000)).toBe(true)
    expect(launched.errors).toEqual([])
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      // The app may still be writing into its user-data dir until it is gone.
      await waitForExit(child, 5000)
    }
    await rm(launched.userDataDir, { recursive: true, force: true })
  }
})
