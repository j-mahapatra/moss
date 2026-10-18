import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { startServer, type FixtureServer } from './fixtures/server'

let server: FixtureServer
let app: ElectronApplication
let page: Page
let errors: string[]

test.beforeAll(async () => {
  server = await startServer()
})

test.afterAll(async () => {
  await server.close()
})

test.beforeEach(async () => {
  errors = []
  const env = { ...process.env, NODE_ENV: 'production' } as Record<string, string>
  delete env['ELECTRON_RENDERER_URL']
  app = await electron.launch({ args: ['out/main/index.js'], env })
  app.process().stderr?.on('data', (d) => {
    const text = String(d)
    if (/error/i.test(text)) errors.push(`main stderr: ${text}`)
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  await page.waitForSelector('[data-url-input]')
})

test.afterEach(async () => {
  await app.close()
  expect(errors).toEqual([])
})

async function send(url: string): Promise<void> {
  const input = page.locator('[data-url-input]')
  await input.fill(url)
  await page.keyboard.press('ControlOrMeta+Enter')
}

test('sends a request and shows status and JSON body', async () => {
  await send(`http://127.0.0.1:${server.port}/hello`)
  await expect(page.locator('[data-response-status]')).toContainText('200 OK')
  await expect(page.locator('[data-response-body]')).toContainText('"greeting": "hi"')
})

test('shows a connection refused error for a closed port', async () => {
  const closed = await startServer()
  const { port } = closed
  await closed.close()
  await send(`http://127.0.0.1:${port}/hello`)
  await expect(page.locator('[data-response-error] h2')).toHaveText(/^Connection refused/)
})

test('cancels an in-flight request with Escape', async () => {
  await send(`http://127.0.0.1:${server.port}/slow`)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-response-error] h2')).toHaveText('Request cancelled')
})
