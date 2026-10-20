import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { newRequestSpec } from '../src/shared/types'
import { launchApp, tearDown, type LaunchedApp } from './fixtures/app'
import { makeTempDirs, readJsonWhenWritten, stubOpenDialog, stubSaveDialog } from './fixtures/files'
import { seedUserData } from './fixtures/seed'
import { startServer, type FixtureServer } from './fixtures/server'

let server: FixtureServer
/** The app's user-data dir; survives a restart within one test. */
let dir: string
/** Fixture and export files for dialog stubs. */
let files: string
let current: LaunchedApp | null = null
const allErrors: string[] = []

test.beforeAll(async () => {
  server = await startServer()
})

test.afterAll(async () => {
  await server.close()
})

test.beforeEach(async () => {
  // Cleared first, so a failed setup never leaves the previous test's paths to tear down.
  dir = ''
  files = ''
  const [userData, exports] = await makeTempDirs('moss-e2e-', 'moss-e2e-files-')
  dir = userData
  files = exports
  server.received.length = 0
  allErrors.length = 0
})

test.afterEach(async () => {
  const app = current
  current = null
  await tearDown(app, allErrors, [dir, files])
})

async function launch(): Promise<Page> {
  current = await launchApp({ userDataDir: dir })
  return current.page
}

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

/** A hand-written v2.1 collection: one folder with a request, plus a top-level request. */
function collectionJson(opts: { script?: boolean } = {}): string {
  const base = `http://127.0.0.1:${server.port}`
  return JSON.stringify({
    info: { name: 'Fixture API', schema: SCHEMA },
    item: [
      {
        name: 'Users',
        item: [{ name: 'List users', request: { method: 'GET', url: `${base}/users` } }]
      },
      {
        name: 'Ping',
        request: { method: 'GET', url: `${base}/hello` },
        ...(opts.script
          ? { event: [{ listen: 'test', script: { exec: ['pm.test("ok", () => {})'] } }] }
          : {})
      }
    ]
  })
}

/**
 * Waits until /echo has stayed untouched for 300 ms counted from `since` (when Send was
 * triggered), so a late send would be seen.
 */
async function expectNothingSent(since: number): Promise<void> {
  await expect
    .poll(
      () =>
        server.received.length > 0 ? 'sent' : Date.now() - since >= 300 ? 'settled' : 'waiting',
      {
        timeout: 2000,
        intervals: [50]
      }
    )
    .toBe('settled')
}

async function openImport(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const panel = page.locator('aside[aria-label="Import"]')
  await expect(panel.getByRole('heading', { name: 'Import' })).toBeVisible()
  return panel
}

async function pasteImport(page: Page, text: string): Promise<ReturnType<Page['locator']>> {
  const panel = await openImport(page)
  await panel.getByLabel('Paste a collection or curl command').fill(text)
  await panel.getByRole('button', { name: 'Import', exact: true }).click()
  return panel
}

/** Checks the imported tree, expanding the folder (folders start collapsed). */
async function expectFixtureTree(page: Page): Promise<void> {
  const tree = page.getByRole('tree', { name: 'Collections' })
  await expect(tree.getByRole('treeitem', { name: 'Fixture API' })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: 'Ping' })).toBeVisible()
  await tree.getByRole('treeitem', { name: 'Users' }).click()
  await expect(tree.getByRole('treeitem', { name: 'List users' })).toBeVisible()
}

test('a curl command pasted into the URL bar is sent as written', async () => {
  await seedUserData(dir, {
    collections: [
      {
        id: randomUUID(),
        name: 'Paste target',
        items: [
          { ...newRequestSpec(), kind: 'request', name: 'Echo', url: 'http://127.0.0.1:9/before' }
        ],
        variables: [],
        schemaVersion: 1
      }
    ]
  })
  const page = await launch()
  const row = page
    .getByRole('tree', { name: 'Collections' })
    .getByRole('treeitem', { name: 'Echo' })
  await row.click()
  await expect(page.locator('[data-url-input]')).toHaveText('http://127.0.0.1:9/before')
  await expect(row.getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0)
  const command = `curl -X POST http://127.0.0.1:${server.port}/echo -H 'X-Test: 1' -d a=1`
  await current!.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), command)
  await page.locator('[data-url-input]').focus()
  // A real paste command, so the editor's paste handler runs.
  await current!.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.paste()
  })
  await expect(page.locator('[data-url-input]')).toHaveText(`http://127.0.0.1:${server.port}/echo`)
  // The paste edits the saved request, which is now unsaved.
  await expect(row.getByRole('img', { name: 'Unsaved changes' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
  expect(server.received).toHaveLength(1)
  const got = server.received[0]!
  expect(got.method).toBe('POST')
  expect(got.headers['x-test']).toBe('1')
  expect(got.body).toBe('a=1')
})

test('a pasted v2.1 collection is imported and survives a restart', async () => {
  let page = await launch()
  const panel = await pasteImport(page, collectionJson())
  await expect(panel.getByText('Imported "Fixture API"')).toBeVisible()
  await panel.getByRole('button', { name: 'Show in Collections' }).click()
  await expectFixtureTree(page)

  await current!.close()
  allErrors.push(...current!.errors)
  current = null

  page = await launch()
  await expectFixtureTree(page)
})

test('Open file… imports a collection and reports what was not carried over', async () => {
  const page = await launch()
  const path = join(files, 'fixture.postman_collection.json')
  await writeFile(path, collectionJson({ script: true }))
  await stubOpenDialog(current!.app, path)
  const panel = await openImport(page)
  await panel.getByRole('button', { name: 'Open file…' }).click()
  await expect(panel.getByText('Imported "Fixture API"')).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Not carried over (1)' })).toBeVisible()
  await expect(panel.getByText('Ping — Scripts were not imported')).toBeVisible()
})

test('a collection exports as v2.1 through the row menu', async () => {
  const page = await launch()
  const panel = await pasteImport(page, collectionJson())
  await panel.getByRole('button', { name: 'Show in Collections' }).click()
  const out = join(files, 'export.json')
  await stubSaveDialog(current!.app, out)

  const row = page.getByRole('tree', { name: 'Collections' }).getByRole('treeitem', {
    name: 'Fixture API'
  })
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page
    .getByRole('menu', { name: 'Actions for Fixture API' })
    .getByRole('menuitem', { name: 'Export…' })
    .click()

  const exported = (await readJsonWhenWritten(out)) as {
    info: { schema: string; name: string }
    item: Array<{ name: string; item?: Array<{ name: string }> }>
  }
  expect(exported.info.schema).toMatch(/v2\.1\.0\/collection\.json$/)
  expect(exported.info.name).toBe('Fixture API')
  expect(exported.item.map((i) => i.name)).toEqual(['Users', 'Ping'])
  expect(exported.item[0]?.item?.map((i) => i.name)).toEqual(['List users'])
})

test('a curl file field imports without its path and blocks Send', async () => {
  const page = await launch()
  const panel = await pasteImport(
    page,
    `curl http://127.0.0.1:${server.port}/echo -F f=@/etc/hosts`
  )
  await expect(panel.getByText('Opened as a new request')).toBeVisible()
  await page.getByRole('tab', { name: /^Body/ }).click()
  await expect(page.getByText('No file chosen')).toBeVisible()
  await expect(page.getByText('/etc/hosts')).toHaveCount(0)

  await page.locator('[data-url-input]').focus()
  const sentAt = Date.now()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-error] h2')).toHaveText(
    'Choose a file for form field "f"'
  )
  await expectNothingSent(sentAt)
})
