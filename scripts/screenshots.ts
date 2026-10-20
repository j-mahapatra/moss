/**
 * Regenerates the README screenshots, assets/moss-light.png and assets/moss-dark.png.
 * Run it with `npm run screenshots`, which builds the app first; it drives the built app in
 * out/ through Playwright. It seeds a throwaway user-data folder with a demo collection and
 * an environment, sends nothing, and removes the folder when done. It runs with
 * MOSS_SECRETS=plain, so it never touches the keychain, and dismisses the notice that mode
 * shows. The 1440×900 size comes from viewport emulation, not from the window size, so it is
 * the same on any screen.
 */
import { _electron as electron, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  newRequestSpec,
  type Collection,
  type Environment,
  type Settings
} from '../src/shared/types'
import { seedUserData } from '../e2e/fixtures/seed'

const root = resolve(import.meta.dirname, '..')
const WIDTH = 1440
const HEIGHT = 900

const collection: Collection = {
  id: randomUUID(),
  name: 'Moss demo',
  items: [
    { ...newRequestSpec(), kind: 'request', name: 'List users', url: '{{baseUrl}}/users?page=1' },
    {
      ...newRequestSpec(),
      kind: 'request',
      name: 'Create user',
      method: 'POST',
      url: '{{baseUrl}}/users',
      headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      body: {
        mode: 'raw',
        contentType: 'application/json',
        text: JSON.stringify({ name: 'Ada Lovelace', role: 'admin' }, null, 2)
      },
      auth: { type: 'bearer', token: '{{token}}' }
    },
    {
      ...newRequestSpec(),
      kind: 'request',
      name: 'Delete user',
      method: 'DELETE',
      url: '{{baseUrl}}/users/42'
    }
  ],
  variables: [],
  schemaVersion: 1
}

const environment: Environment = {
  id: randomUUID(),
  name: 'staging',
  variables: [
    { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
    { key: 'token', value: 'demo-token', enabled: true }
  ],
  schemaVersion: 1
}

const settings: Settings = {
  schemaVersion: 1,
  split: 0.5,
  navigatorCollapsed: false,
  activeEnvironmentId: environment.id,
  theme: 'light'
}

const paletteKey = process.platform === 'darwin' ? 'Meta+k' : 'Control+k'

async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  // Let transitions and the caret settle.
  await page.waitForTimeout(300)
  const path = join(root, 'assets', name)
  await page.screenshot({ path, scale: 'css' })
  console.log(`Wrote ${path}`)
}

async function main(): Promise<void> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'moss-screenshots-'))
  try {
    await seedUserData(userDataDir, {
      collections: [collection],
      environments: [environment],
      settings
    })
    await mkdir(join(root, 'assets'), { recursive: true })
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      MOSS_USER_DATA: userDataDir,
      // Tooling never touches the real keychain.
      MOSS_SECRETS: 'plain'
    } as Record<string, string>
    delete env['ELECTRON_RENDERER_URL']
    const app = await electron.launch({ args: [join(root, 'out/main/index.js')], cwd: root, env })
    try {
      const page = await app.firstWindow()
      // Emulated, so the capture is exactly 1440×900 even on a screen too short for that window.
      await page.setViewportSize({ width: WIDTH, height: HEIGHT })
      await page.waitForSelector('[data-url-input]')
      // Plain mode warns that secrets are unencrypted; keep that out of the pictures.
      const notice = page.getByRole('status').filter({
        hasText: 'Secrets are stored unencrypted on this system.'
      })
      await notice.getByRole('button', { name: 'Dismiss' }).click()
      await notice.waitFor({ state: 'detached' })
      await page
        .getByRole('tree', { name: 'Collections' })
        .getByRole('treeitem', { name: 'Create user' })
        .click()
      await page.locator('[data-url-input]').getByText('/users').waitFor()
      await page.getByRole('tab', { name: 'Body' }).click()
      await capture(page, 'moss-light.png')

      // Switch to dark through the palette, then show the palette itself.
      const palette = page.getByRole('dialog', { name: 'Command palette' })
      await page.keyboard.press(paletteKey)
      await page.keyboard.type('Theme: Dark')
      await palette.getByRole('option', { name: /^Theme: Dark/ }).click()
      await palette.waitFor({ state: 'hidden' })
      await page.locator('html[data-theme="dark"]').waitFor({ state: 'attached' })
      await page.keyboard.press(paletteKey)
      await palette.waitFor()
      await page.keyboard.type('user')
      await capture(page, 'moss-dark.png')
    } finally {
      await app.close()
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
