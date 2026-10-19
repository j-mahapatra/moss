import { expect, test } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { launchApp } from './fixtures/app'

// Electron's signal handler starts a quit that the write drain holds; the app must still exit
// (on macOS it used to stop at window-all-closed and idle forever).
test('SIGTERM quits the app within 5 seconds', async () => {
  const launched = await launchApp()
  const child = launched.app.process()
  try {
    const exited = new Promise<number | null>((resolve) => {
      if (child.exitCode !== null) resolve(child.exitCode)
      else child.once('exit', (code) => resolve(code))
    })
    child.kill('SIGTERM')
    const result = await Promise.race([
      exited.then(() => 'exited' as const),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000))
    ])
    expect(result).toBe('exited')
    expect(launched.errors).toEqual([])
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await rm(launched.userDataDir, { recursive: true, force: true })
  }
})
