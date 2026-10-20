import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userDataDir: string
  /** Console, page and main-process errors collected since launch. */
  errors: string[]
  /** Closes the app. Removes the user-data dir only if the helper created it. */
  close(): Promise<void>
}

/**
 * Launches the built app against an isolated user-data folder.
 * Without `userDataDir` a fresh temp dir is created and removed on close;
 * a caller-supplied dir is left alone for the caller to clean up.
 */
export async function launchApp(opts: { userDataDir?: string } = {}): Promise<LaunchedApp> {
  const owned = opts.userDataDir === undefined
  const userDataDir = opts.userDataDir ?? (await mkdtemp(join(tmpdir(), 'moss-e2e-')))
  const errors: string[] = []
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MOSS_USER_DATA: userDataDir,
    // Keep e2e off the real keychain.
    MOSS_SECRETS: 'plain'
  } as Record<string, string>
  delete env['ELECTRON_RENDERER_URL']
  const app = await electron.launch({ args: ['out/main/index.js'], env })
  app.context().on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  app.context().on('weberror', (e) => errors.push(`pageerror: ${e.error().message}`))
  app.process().stderr?.on('data', (d) => {
    const text = String(d)
    if (/Uncaught|UnhandledPromiseRejection|Error invoking remote method/.test(text))
      errors.push(`main stderr: ${text}`)
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-url-input]')
  return {
    app,
    page,
    userDataDir,
    errors,
    close: async () => {
      try {
        await app.close()
      } finally {
        if (owned) await rm(userDataDir, { recursive: true, force: true })
      }
    }
  }
}

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * The shared afterEach: closes `app` (if a test left one open), then asserts that no errors were
 * collected, its own and those already in `errors`. A failed close is reported as an error. The
 * `dirs` are removed whatever happens; a failure to remove them is only thrown when everything
 * else passed, so it never hides the real failure.
 */
export async function tearDown(
  app: LaunchedApp | null,
  errors: string[],
  dirs: string[] = []
): Promise<void> {
  let failure: { error: unknown } | null = null
  try {
    if (app) {
      await app.close().catch((err: unknown) => {
        errors.push(`close: ${describeError(err)}`)
      })
      // After closing, so errors raised while shutting down are counted too.
      errors.push(...app.errors)
    }
    expect(errors).toEqual([])
  } catch (error) {
    failure = { error }
  }
  const removed = await Promise.allSettled(
    dirs.filter((d) => d !== '').map((d) => rm(d, { recursive: true, force: true }))
  )
  if (failure) throw failure.error
  const failedRemove = removed.find((r) => r.status === 'rejected')
  if (failedRemove) throw failedRemove.reason
}
