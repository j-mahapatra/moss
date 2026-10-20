// launchApp sets MOSS_SECRETS=plain, so these runs never reach the keychain and secrets are stored
// unsealed. Sealing and opening with a real cipher are covered by the unit tests.
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newRequestSpec } from '../src/shared/types'
import { launchApp, tearDown, type LaunchedApp } from './fixtures/app'
import { seedUserData } from './fixtures/seed'
import { startServer, type FixtureServer } from './fixtures/server'

let server: FixtureServer
/** The app's user-data dir. */
let dir: string
/** Where the export dialog stub writes. */
let files: string
let current: LaunchedApp | null = null
const allErrors: string[] = []

const SECRET = 's3cr3t-e2e-value'
const TOKEN = 'tok-e2e-0123456789'

test.beforeAll(async () => {
  server = await startServer()
})

test.afterAll(async () => {
  await server.close()
})

test.beforeEach(async () => {
  dir = ''
  files = ''
  dir = await mkdtemp(join(tmpdir(), 'moss-e2e-'))
  try {
    files = await mkdtemp(join(tmpdir(), 'moss-e2e-files-'))
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    dir = ''
    throw err
  }
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

/** Opens the variables editor of the environment `name` in the Environments panel. */
async function openEnvironmentVariables(
  page: Page,
  name: string
): Promise<ReturnType<Page['getByRole']>> {
  const row = page
    .locator('aside[aria-label="Environments"]')
    .getByRole('listitem', { name, exact: true })
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit variables…' }).click()
  return page.getByRole('dialog', { name: /^Variables/ })
}

test('a secret environment variable is masked, hidden on hover and still sent', async () => {
  const page = await launch()
  // MOSS_SECRETS=plain has no encryption, which the app says once.
  await expect(page.getByText('Secrets are stored unencrypted on this system.')).toBeVisible()

  await page.getByRole('button', { name: 'Environments', exact: true }).click()
  await page
    .locator('aside[aria-label="Environments"]')
    .getByRole('button', { name: 'New environment' })
    .click()
  const rename = page.getByRole('textbox', { name: 'Rename' })
  await expect(rename).toBeFocused()
  await rename.fill('dev')
  await page.keyboard.press('Enter')
  await expect(rename).toBeHidden()

  let vars = await openEnvironmentVariables(page, 'dev')
  await vars.getByLabel('Key 1').fill('token')
  await vars.getByLabel('Value 1').fill(SECRET)
  const lock = vars.getByRole('button', { name: 'Mark token secret' })
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await expect(vars.getByRole('textbox', { name: 'Value 1', exact: true })).toHaveAttribute(
    'type',
    'password'
  )
  await vars.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(vars).toBeHidden()

  // Reopened, the value is still masked, kept out of the markup, and revealed only on request.
  vars = await openEnvironmentVariables(page, 'dev')
  const value = vars.getByRole('textbox', { name: 'Value 1', exact: true })
  await expect(value).toHaveAttribute('type', 'password')
  await expect(value).toHaveValue(SECRET)
  expect(await page.content()).not.toContain(SECRET)
  await vars.getByRole('button', { name: 'Show Value 1' }).click()
  await expect(value).toHaveAttribute('type', 'text')
  await vars.getByRole('button', { name: 'Cancel' }).click()
  await expect(vars).toBeHidden()

  await page.getByRole('button', { name: /^Environment:/ }).click()
  const popover = page.getByRole('dialog', { name: 'Environments' })
  await popover.getByRole('radio', { name: 'dev' }).check()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()

  const url = page.locator('[data-url-input]')
  await url.fill(`http://127.0.0.1:${server.port}/echo?key={{token}}`)
  await url.locator('.var-resolved').hover()
  const tip = page.locator('.moss-var-tip')
  await expect(tip).toHaveText('•••• (secret)')
  expect(await page.content()).not.toContain(SECRET)

  await url.focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
  expect(server.received.map((r) => r.url)).toEqual([`/echo?key=${SECRET}`])
})

test('an exported collection leaves out its bearer token and says so', async () => {
  await seedUserData(dir, {
    collections: [
      {
        id: randomUUID(),
        name: 'Token API',
        items: [
          {
            ...newRequestSpec(),
            kind: 'request',
            name: 'Me',
            url: 'http://127.0.0.1:9/me',
            auth: { type: 'bearer', token: TOKEN }
          }
        ],
        variables: [],
        schemaVersion: 1
      }
    ]
  })
  const page = await launch()
  const out = join(files, 'export.json')
  await current!.app.evaluate(({ dialog }, p) => {
    Object.assign(dialog, { showSaveDialog: async () => ({ canceled: false, filePath: p }) })
  }, out)

  const row = page
    .getByRole('tree', { name: 'Collections' })
    .getByRole('treeitem', { name: 'Token API' })
  await row.hover()
  await row.getByRole('button', { name: 'More actions' }).click()
  await page
    .getByRole('menu', { name: 'Actions for Token API' })
    .getByRole('menuitem', { name: 'Export…' })
    .click()

  await expect(page.getByText('Secret values were left out of the export (1).')).toBeVisible()
  let text = ''
  await expect
    .poll(async () => {
      try {
        text = await readFile(out, 'utf8')
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    })
    .toBe(true)
  expect(text).not.toContain(TOKEN)
  const exported = JSON.parse(text) as {
    item: Array<{ name: string; request: { auth?: { type: string } } }>
  }
  expect(exported.item[0]?.name).toBe('Me')
  expect(exported.item[0]?.request.auth?.type).toBe('bearer')
})
