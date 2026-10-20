import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, tearDown, type LaunchedApp } from './fixtures/app'
import { startServer, type FixtureServer } from './fixtures/server'

let serverA: FixtureServer
let serverB: FixtureServer
let dir: string
let current: LaunchedApp | null = null
const allErrors: string[] = []

test.beforeAll(async () => {
  serverA = await startServer({ greeting: 'from-a' })
  serverB = await startServer({ greeting: 'from-b' })
})

test.afterAll(async () => {
  await serverA.close()
  await serverB.close()
})

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-e2e-'))
  allErrors.length = 0
})

test.afterEach(async () => {
  const app = current
  current = null
  await tearDown(app, allErrors, [dir])
})

async function launch(): Promise<Page> {
  current = await launchApp({ userDataDir: dir })
  return current.page
}

const urlA = (): string => `http://127.0.0.1:${serverA.port}`
const urlB = (): string => `http://127.0.0.1:${serverB.port}`

/** Creates an environment in the Environments panel with one variable. */
async function createEnvironment(
  page: Page,
  name: string,
  key: string,
  value: string
): Promise<void> {
  const panel = page.locator('aside[aria-label="Environments"]')
  await panel.getByRole('button', { name: 'New environment' }).click()
  const rename = page.getByRole('textbox', { name: 'Rename' })
  await expect(rename).toBeFocused()
  await rename.fill(name)
  await page.keyboard.press('Enter')
  await expect(rename).toBeHidden()
  const row = panel.getByRole('listitem', { name, exact: true })
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit variables…' }).click()
  const vars = page.getByRole('dialog', { name: /^Variables/ })
  await vars.getByLabel('Key 1').fill(key)
  await vars.getByLabel('Value 1').fill(value)
  await vars.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(vars).toBeHidden()
}

/** Opens the chip popover, picks an environment (or none) and closes it with Escape. */
async function selectEnvironment(page: Page, name: string | null): Promise<void> {
  await page.getByRole('button', { name: /^Environment:/ }).click()
  const popover = page.getByRole('dialog', { name: 'Environments' })
  await popover.getByRole('radio', { name: name ?? 'No environment' }).check()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
}

test('switching the environment changes where a request goes', async () => {
  const page = await launch()
  await page.getByRole('button', { name: 'Environments', exact: true }).click()
  await createEnvironment(page, 'dev', 'base', urlA())
  await createEnvironment(page, 'prod', 'base', urlB())

  await page.locator('[data-url-input]').fill('{{base}}/hello')

  await selectEnvironment(page, 'dev')
  await expect(page.getByRole('button', { name: 'Environment: dev' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-body]')).toContainText('from-a')

  // Send immediately after switching: no waiting for settings to be written.
  await selectEnvironment(page, 'prod')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-body]')).toContainText('from-b')
})

test('the active environment beats a collection variable', async () => {
  const page = await launch()
  await page.getByRole('button', { name: 'Environments', exact: true }).click()
  await createEnvironment(page, 'dev', 'base', urlA())

  await page.getByRole('button', { name: 'Collections', exact: true }).click()
  await page.getByRole('button', { name: 'Create collection' }).click()
  const rename = page.getByRole('textbox', { name: 'Rename' })
  await expect(rename).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(rename).toBeHidden()

  const nav = page.locator('aside[aria-label="Collections"]')
  const row = nav.getByRole('treeitem').first()
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /^Variables/ }).click()
  const vars = page.getByRole('dialog', { name: /^Variables/ })
  await vars.getByLabel('Key 1').fill('base')
  await vars.getByLabel('Value 1').fill(urlB())
  await vars.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(vars).toBeHidden()

  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'New request' }).click()
  await expect(nav.getByRole('treeitem', { name: 'Untitled request' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.locator('[data-url-input]').fill('{{base}}/hello')

  await selectEnvironment(page, 'dev')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-body]')).toContainText('from-a')

  await selectEnvironment(page, null)
  await expect(page.getByRole('button', { name: 'Environment: none' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-body]')).toContainText('from-b')
})

test('the active environment persists across restart', async () => {
  let page = await launch()
  await page.getByRole('button', { name: 'Environments', exact: true }).click()
  await createEnvironment(page, 'prod', 'base', urlB())
  await selectEnvironment(page, 'prod')
  await expect(page.getByRole('button', { name: 'Environment: prod' })).toBeVisible()
  // Wait for the setting to reach disk before closing.
  await expect
    .poll(async () => {
      try {
        return (await readFile(join(dir, 'settings.json'), 'utf8')).includes('activeEnvironmentId')
      } catch {
        return false
      }
    })
    .toBe(true)

  allErrors.push(...(current as LaunchedApp).errors)
  await (current as LaunchedApp).app.close()
  current = null

  page = await launch()
  await expect(page.getByRole('button', { name: 'Environment: prod' })).toBeVisible()
})

test('a settings file from before environments loads without a notice', async () => {
  await writeFile(
    join(dir, 'settings.json'),
    JSON.stringify({ schemaVersion: 1, split: 0.5, navigatorCollapsed: false })
  )
  const page = await launch()
  await expect(page.getByRole('button', { name: 'Environment: none' })).toBeVisible()
  await expect(page.getByText(/Couldn't read/)).toHaveCount(0)
  const files = await readdir(dir)
  expect(files.filter((f) => f.startsWith('settings.corrupt-'))).toEqual([])
})
