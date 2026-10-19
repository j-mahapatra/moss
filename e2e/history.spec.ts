import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, type LaunchedApp } from './fixtures/app'
import { writeHistoryFile } from './fixtures/history-file'
import { startServer, type FixtureServer } from './fixtures/server'

let server: FixtureServer
let dir: string
let current: LaunchedApp | null = null
const allErrors: string[] = []

test.beforeAll(async () => {
  server = await startServer()
})

test.afterAll(async () => {
  await server.close()
})

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-e2e-'))
  allErrors.length = 0
})

test.afterEach(async () => {
  if (current) {
    allErrors.push(...current.errors)
    await current.close().catch(() => undefined)
    current = null
  }
  await rm(dir, { recursive: true, force: true })
  expect(allErrors).toEqual([])
})

async function launch(): Promise<Page> {
  current = await launchApp({ userDataDir: dir })
  return current.page
}

const historyPath = (): string => join(dir, 'history.jsonl')

async function readLines(): Promise<string[]> {
  try {
    const text = await readFile(historyPath(), 'utf8')
    return text.split('\n').filter((l) => l !== '')
  } catch {
    return []
  }
}

async function sendTo(page: Page, url: string): Promise<void> {
  await page.locator('[data-url-input]').fill(url)
  await page.keyboard.press('ControlOrMeta+Enter')
}

async function closedPortUrl(): Promise<string> {
  const closed = await startServer()
  const { port } = closed
  await closed.close()
  return `http://127.0.0.1:${port}/hello`
}

async function openHistory(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.getByRole('button', { name: 'History', exact: true }).click()
  const panel = page.locator('aside[aria-label="History"]')
  await expect(panel).toBeVisible()
  return panel
}

/** Sends a good request, then one to a closed port, leaving two history entries. */
async function recordTwo(page: Page): Promise<string> {
  const okUrl = `http://127.0.0.1:${server.port}/hello`
  await sendTo(page, okUrl)
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
  await sendTo(page, await closedPortUrl())
  await expect(page.locator('[data-response-error] h2')).toHaveText(/^Connection refused/)
  return okUrl
}

test('records sends and lists them newest first', async () => {
  const page = await launch()
  await recordTwo(page)
  const panel = await openHistory(page)
  const rows = panel.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByText('Error', { exact: true })).toBeVisible()
  await expect(rows.nth(1).getByText('200', { exact: true })).toBeVisible()
})

test('history persists across a restart', async () => {
  const page = await launch()
  await recordTwo(page)
  await expect.poll(async () => (await readLines()).length).toBe(2)
  await current!.close()
  current = null

  const again = await launch()
  const panel = await openHistory(again)
  await expect(panel.getByRole('listitem')).toHaveCount(2)
})

test('a history row reopens its request and can be sent again', async () => {
  const page = await launch()
  const okUrl = await recordTwo(page)
  const panel = await openHistory(page)
  await panel.getByRole('listitem', { name: `GET ${okUrl}` }).click()
  // The current draft is an unsaved edit, so opening an entry asks first.
  const discard = page.getByRole('dialog', { name: 'Discard unsaved request?' })
  await discard.getByRole('button', { name: 'Discard' }).click()
  await expect(discard).toBeHidden()
  await expect(page.locator('[data-url-input]')).toHaveText(okUrl)
  await page.locator('[data-url-input]').focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
  await expect(panel.getByRole('listitem')).toHaveCount(3)
})

test('history stores the template, never the secret value', async () => {
  const page = await launch()
  await page.getByRole('button', { name: 'Environments', exact: true }).click()
  const envPanel = page.locator('aside[aria-label="Environments"]')
  await envPanel.getByRole('button', { name: 'New environment' }).click()
  const rename = page.getByRole('textbox', { name: 'Rename' })
  await expect(rename).toBeFocused()
  await rename.fill('dev')
  await page.keyboard.press('Enter')
  await expect(rename).toBeHidden()
  const row = envPanel.getByRole('listitem', { name: 'dev', exact: true })
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit variables…' }).click()
  const vars = page.getByRole('dialog', { name: /^Variables/ })
  await vars.getByLabel('Key 1').fill('token')
  await vars.getByLabel('Value 1').fill('s3cr3t-value')
  await vars.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(vars).toBeHidden()

  await page.getByRole('button', { name: /^Environment:/ }).click()
  const popover = page.getByRole('dialog', { name: 'Environments' })
  await popover.getByRole('radio', { name: 'dev' }).check()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()

  await page.getByRole('tab', { name: /^Headers/ }).click()
  await page.getByLabel('Key 1', { exact: true }).fill('Authorization')
  await page.getByLabel('Value 1', { exact: true }).fill('Bearer {{token}}')
  await sendTo(page, `http://127.0.0.1:${server.port}/hello`)
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')

  await expect.poll(async () => (await readLines()).length).toBe(1)
  const text = (await readLines()).join('\n')
  expect(text).toContain('{{token}}')
  expect(text).not.toContain('s3cr3t-value')
})

test('history is capped at 500 entries on startup', async () => {
  await writeHistoryFile(historyPath(), 600)
  const page = await launch()
  await expect.poll(async () => (await readLines()).length).toBe(500)
  const panel = await openHistory(page)
  await expect(panel.getByRole('listitem')).toHaveCount(500)
})

test('a quick quit still saves the collapsed navigator', async () => {
  const page = await launch()
  await expect(page.locator('aside[aria-label="Collections"]')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+b')
  await expect(page.locator('aside[aria-label="Collections"]')).toBeHidden()
  await current!.close()
  current = null

  const again = await launch()
  await expect(again.locator('[data-url-input]')).toBeVisible()
  await expect(again.locator('aside[aria-label="Collections"]')).toHaveCount(0)
  await expect(again.locator('aside')).toHaveCount(0)
})
