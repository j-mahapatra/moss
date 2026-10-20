import { expect, type ElectronApplication } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Creates one temp dir per prefix, in order. If any fails, the ones already made are removed
 * before the error is rethrown, so a failed setup leaves nothing behind.
 */
export async function makeTempDirs<const P extends readonly string[]>(
  ...prefixes: P
): Promise<{ [K in keyof P]: string }> {
  const made: string[] = []
  try {
    for (const prefix of prefixes) made.push(await mkdtemp(join(tmpdir(), prefix)))
  } catch (err) {
    await Promise.allSettled(made.map((d) => rm(d, { recursive: true, force: true })))
    throw err
  }
  return made as { [K in keyof P]: string }
}

/** Polls until `path` exists and holds valid JSON (the save may still be in progress); returns its text. */
export async function readTextWhenJson(path: string): Promise<string> {
  let text = ''
  await expect
    .poll(async () => {
      try {
        text = await readFile(path, 'utf8')
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    })
    .toBe(true)
  return text
}

/** Like readTextWhenJson, but returns the parsed value. */
export async function readJsonWhenWritten(path: string): Promise<unknown> {
  return JSON.parse(await readTextWhenJson(path)) as unknown
}

// The stubs replace the main-process dialogs and ignore the optional parent window.

/** Makes the next open dialogs choose `path`. */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    Object.assign(dialog, { showOpenDialog: async () => ({ canceled: false, filePaths: [p] }) })
  }, path)
}

/** Makes the next save dialogs choose `path`. */
export async function stubSaveDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    Object.assign(dialog, { showSaveDialog: async () => ({ canceled: false, filePath: p }) })
  }, path)
}
