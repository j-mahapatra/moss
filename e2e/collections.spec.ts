import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, type LaunchedApp } from './fixtures/app'
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

const collectionsDir = (): string => join(dir, 'collections')

async function collectionFiles(): Promise<string[]> {
  try {
    return (await readdir(collectionsDir())).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
  } catch {
    return []
  }
}

/** Creates a collection from the empty state and leaves inline rename. */
async function createCollection(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Create collection' }).click()
  // Creation is async; wait for the inline rename input before leaving it.
  const rename = page.getByRole('textbox', { name: 'Rename' })
  await expect(rename).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(rename).toBeHidden()
}

test('a saved request persists across restart', async () => {
  const url = `http://127.0.0.1:${server.port}/hello`
  let page = await launch()
  await createCollection(page)
  await page.locator('[data-url-input]').fill(url)
  await page.keyboard.press('ControlOrMeta+s')
  const dialog = page.getByRole('dialog', { name: 'Save request' })
  await dialog.getByLabel('Name').fill('Hello')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  const tree = page.getByRole('tree', { name: 'Collections' })
  await expect(tree.getByRole('treeitem', { name: 'Hello' })).toBeVisible()

  await expect
    .poll(async () => {
      for (const f of await collectionFiles()) {
        if ((await readFile(join(collectionsDir(), f), 'utf8')).includes(url)) return true
      }
      return false
    })
    .toBe(true)

  allErrors.push(...(current as LaunchedApp).errors)
  await (current as LaunchedApp).app.close()
  current = null

  page = await launch()
  const item = page
    .getByRole('tree', { name: 'Collections' })
    .getByRole('treeitem', { name: 'Hello' })
  await expect(item).toBeVisible()
  await item.click()
  await expect(page.locator('[data-url-input]')).toContainText(url)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
})

test('a corrupt collection file is quarantined', async () => {
  const original = `${randomUUID()}.json`
  await mkdir(collectionsDir(), { recursive: true })
  await writeFile(join(collectionsDir(), original), '{oops')

  const page = await launch()
  await expect(page.getByText(/Couldn't read/).first()).toBeVisible()
  const files = await readdir(collectionsDir())
  expect(files.some((f) => /\.corrupt-.*\.json$/.test(f))).toBe(true)
  expect(files).not.toContain(original)

  // The app is still usable.
  await page.getByRole('button', { name: 'Create collection' }).click()
  await expect(page.getByRole('tree', { name: 'Collections' })).toBeVisible()
})

test('collection variables resolve in a new request', async () => {
  const page = await launch()
  await createCollection(page)
  const nav = page.locator('aside[aria-label="Collections"]')
  const row = nav.getByRole('treeitem').first()

  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /^Variables/ }).click()
  const vars = page.getByRole('dialog', { name: /^Variables/ })
  await vars.getByLabel('Key 1').fill('base')
  await vars.getByLabel('Value 1').fill(`http://127.0.0.1:${server.port}`)
  await vars.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(vars).toBeHidden()

  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'New request' }).click()
  // The request is added and opened asynchronously; wait for it before typing.
  await expect(nav.getByRole('treeitem', { name: 'Untitled request' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.locator('[data-url-input]').fill('{{base}}/hello')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
})
