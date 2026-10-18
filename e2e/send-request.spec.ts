import { expect, test, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp } from './fixtures/app'
import { startServer, type FixtureServer } from './fixtures/server'

let server: FixtureServer
let launched: LaunchedApp
let page: Page

test.beforeAll(async () => {
  server = await startServer()
})

test.afterAll(async () => {
  await server.close()
})

test.beforeEach(async () => {
  launched = await launchApp()
  page = launched.page
})

test.afterEach(async () => {
  await launched.close()
  expect(launched.errors).toEqual([])
})

async function send(url: string): Promise<void> {
  const input = page.locator('[data-url-input]')
  await input.fill(url)
  await page.keyboard.press('ControlOrMeta+Enter')
}

test('workbench body fills the window below the top bar', async () => {
  const box = await page.locator('.workbench__body').boundingBox()
  expect(box?.height).toBeGreaterThan(400)
})

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
  const received = server.slowReceived()
  await send(`http://127.0.0.1:${server.port}/slow`)
  await received
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-response-error] h2')).toHaveText('Request cancelled')
})
