import { expect, test, type Locator, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newRequestSpec, type Collection } from '../src/shared/types'
import { launchApp, tearDown, type LaunchedApp } from './fixtures/app'
import { seedUserData } from './fixtures/seed'

let dir: string
let current: LaunchedApp | null = null
const allErrors: string[] = []

// Nothing is sent in these tests, so the URLs never need to resolve.
const ALPHA_URL = 'http://127.0.0.1:9/alpha'
const BETA_URL = 'http://127.0.0.1:9/beta'

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-e2e-'))
  allErrors.length = 0
  const collection: Collection = {
    id: randomUUID(),
    name: 'Palette fixtures',
    items: [
      { ...newRequestSpec(), kind: 'request', name: 'Alpha listing', url: ALPHA_URL },
      { ...newRequestSpec(), kind: 'request', name: 'Beta details', url: BETA_URL }
    ],
    variables: [],
    schemaVersion: 1
  }
  await seedUserData(dir, { collections: [collection] })
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

async function restart(): Promise<Page> {
  allErrors.push(...(current as LaunchedApp).errors)
  await (current as LaunchedApp).app.close()
  current = null
  return launch()
}

const paletteKey = process.platform === 'darwin' ? 'Meta+k' : 'Control+k'
const palette = (page: Page): Locator => page.getByRole('dialog', { name: 'Command palette' })
const urlInput = (page: Page): Locator => page.locator('[data-url-input]')

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(paletteKey)
  await expect(palette(page)).toBeVisible()
  await expect(
    palette(page).getByPlaceholder('Search requests, collections, commands…')
  ).toBeFocused()
}

async function chooseTheme(page: Page, theme: 'Light' | 'Dark'): Promise<void> {
  await openPalette(page)
  await page.keyboard.type(`Theme: ${theme}`)
  await palette(page)
    .getByRole('option', { name: new RegExp(`^Theme: ${theme}`) })
    .click()
  await expect(palette(page)).toBeHidden()
}

async function openFromTree(page: Page, name: string, url: string): Promise<void> {
  await page.getByRole('tree', { name: 'Collections' }).getByRole('treeitem', { name }).click()
  await expect(urlInput(page)).toContainText(url)
}

test('the palette finds a saved request by part of its name and opens it', async () => {
  const page = await launch()
  await openPalette(page)
  await page.keyboard.type('beta det')
  await expect(palette(page).getByRole('option').first()).toContainText('Beta details')
  await page.keyboard.press('Enter')
  await expect(palette(page)).toBeHidden()
  await expect(urlInput(page)).toContainText(BETA_URL)
})

test('Theme: Dark applies at once and survives a restart', async () => {
  let page = await launch()
  // Start from Light, so the test doesn't depend on the machine's own appearance.
  await chooseTheme(page, 'Light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  page = await restart()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('⌃Tab switches back to the previously opened request', async () => {
  const page = await launch()
  await openFromTree(page, 'Alpha listing', ALPHA_URL)
  await openFromTree(page, 'Beta details', BETA_URL)

  await page.keyboard.down('Control')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('dialog', { name: 'Recent requests' })).toBeVisible()
  await page.keyboard.up('Control')

  await expect(page.getByRole('dialog', { name: 'Recent requests' })).toBeHidden()
  await expect(urlInput(page)).toContainText(ALPHA_URL)
})

test('Esc closes the palette and returns focus to the URL bar', async () => {
  const page = await launch()
  await urlInput(page).click()
  await expect(urlInput(page)).toBeFocused()
  await openPalette(page)
  await page.keyboard.press('Escape')
  await expect(palette(page)).toBeHidden()
  await expect(urlInput(page)).toBeFocused()
})
