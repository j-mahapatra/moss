import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import zlib from 'node:zlib'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo, Socket } from 'node:net'
import { executeRequest } from './execute'
import type { ResolvedRequest, RunOptions } from '../shared/types'

const opts: RunOptions = { timeoutMs: 5000, maxRedirects: 10, maxBodyBytes: 50 * 1024 * 1024 }
let server: http.Server
let base: string
const sockets = new Set<Socket>()
let tmpDir: string

const get = (url: string): ResolvedRequest => ({ method: 'GET', url, headers: [], body: null })
const text = (r: Awaited<ReturnType<typeof executeRequest>>): string =>
  r.ok ? Buffer.from(r.response.bodyBase64, 'base64').toString('utf8') : ''

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moss-exec-'))
  server = http.createServer((req, res) => {
    const u = req.url ?? '/'
    if (u === '/json') {
      res.setHeader('content-type', 'application/json')
      res.end('{"a":1}')
    } else if (u === '/set-cookies') {
      res.setHeader('set-cookie', ['a=1', 'b=2'])
      res.end('ok')
    } else if (u === '/gzip') {
      res.setHeader('content-encoding', 'gzip')
      res.end(zlib.gzipSync('hello'))
    } else if (u === '/br') {
      res.setHeader('content-encoding', 'br')
      res.end(zlib.brotliCompressSync('hello'))
    } else if (u === '/badgzip') {
      res.setHeader('content-encoding', 'gzip')
      res.end('not gzip at all')
    } else if (u.startsWith('/redirect/')) {
      const n = Number(u.split('/')[2])
      if (n <= 0) res.end('done')
      else {
        res.statusCode = 302
        res.setHeader('location', `/redirect/${n - 1}`)
        res.end()
      }
    } else if (u === '/echo') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        res.setHeader('x-ct', req.headers['content-type'] ?? '')
        res.end(Buffer.concat(chunks))
      })
    } else if (u === '/big') {
      res.end(Buffer.alloc(2 * 1024 * 1024, 97))
    } else if (u === '/slow') {
      // never responds
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  for (const s of sockets) s.destroy()
  await new Promise<void>((r) => server.close(() => r()))
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('executeRequest', () => {
  it('GET json', async () => {
    const r = await executeRequest(get(`${base}/json`), opts, new AbortController().signal)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.response.status).toBe(200)
    expect(r.response.statusText).toBe('OK')
    expect(text(r)).toBe('{"a":1}')
    expect(r.response.size).toBe(7)
    expect(r.response.truncated).toBe(false)
    expect(r.response.timings.ttfbMs).toBeGreaterThanOrEqual(0)
    expect(r.response.timings.totalMs).toBeGreaterThanOrEqual(r.response.timings.ttfbMs)
  })

  it('keeps multiple set-cookie headers in order', async () => {
    const r = await executeRequest(get(`${base}/set-cookies`), opts, new AbortController().signal)
    if (!r.ok) throw new Error('expected ok')
    expect(r.response.headers.filter(([n]) => n === 'set-cookie').map(([, v]) => v)).toEqual([
      'a=1',
      'b=2'
    ])
  })

  it('decodes gzip and br', async () => {
    for (const p of ['/gzip', '/br']) {
      const r = await executeRequest(get(`${base}${p}`), opts, new AbortController().signal)
      expect(text(r)).toBe('hello')
      if (r.ok) expect(r.response.size).toBe(5)
    }
  })

  it('corrupt gzip becomes unknown error', async () => {
    const r = await executeRequest(get(`${base}/badgzip`), opts, new AbortController().signal)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('unknown')
      expect(r.error.message).toMatch(/^Request failed:/)
    }
  })

  it('follows redirects up to the limit', async () => {
    const ok = await executeRequest(get(`${base}/redirect/3`), opts, new AbortController().signal)
    expect(ok.ok && ok.response.status).toBe(200)
    expect(text(ok)).toBe('done')
    const bad = await executeRequest(
      get(`${base}/redirect/11`),
      { ...opts, maxRedirects: 10 },
      new AbortController().signal
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.kind).toBe('unknown')
      expect(bad.error.message).toMatch(/^Request failed:/)
    }
  })

  it('maxRedirects varies per call', async () => {
    const r = await executeRequest(
      get(`${base}/redirect/3`),
      { ...opts, maxRedirects: 1 },
      new AbortController().signal
    )
    expect(r.ok).toBe(false)
  })

  it('POST text body', async () => {
    const r = await executeRequest(
      {
        method: 'POST',
        url: `${base}/echo`,
        headers: [['Content-Type', 'text/plain']],
        body: { kind: 'text', text: 'ping' }
      },
      opts,
      new AbortController().signal
    )
    expect(text(r)).toBe('ping')
    if (r.ok) expect(r.response.headers).toContainEqual(['x-ct', 'text/plain'])
  })

  it('POST form body with file', async () => {
    const file = path.join(tmpDir, 'up.txt')
    fs.writeFileSync(file, 'file-contents')
    const r = await executeRequest(
      {
        method: 'POST',
        url: `${base}/echo`,
        headers: [],
        body: {
          kind: 'form',
          fields: [
            { name: 'title', value: 'hi' },
            { name: 'upload', filePath: file }
          ]
        }
      },
      opts,
      new AbortController().signal
    )
    const body = text(r)
    expect(body).toContain('name="title"')
    expect(body).toContain('hi')
    expect(body).toContain('name="upload"; filename="up.txt"')
    expect(body).toContain('file-contents')
  })

  it('missing form file is invalid-request', async () => {
    const missing = path.join(tmpDir, 'nope.bin')
    const r = await executeRequest(
      {
        method: 'POST',
        url: 'http://127.0.0.1:1/',
        headers: [],
        body: { kind: 'form', fields: [{ name: 'f', filePath: missing }] }
      },
      opts,
      new AbortController().signal
    )
    expect(r).toMatchObject({
      ok: false,
      error: { kind: 'invalid-request', message: `File not found: ${missing}` }
    })
  })

  it('truncates at maxBodyBytes', async () => {
    const r = await executeRequest(
      get(`${base}/big`),
      { ...opts, maxBodyBytes: 1_000_000 },
      new AbortController().signal
    )
    if (!r.ok) throw new Error('expected ok')
    expect(r.response.size).toBe(1_000_000)
    expect(r.response.truncated).toBe(true)
    expect(Buffer.from(r.response.bodyBase64, 'base64').length).toBe(1_000_000)
  })

  it('times out', async () => {
    const r = await executeRequest(
      get(`${base}/slow`),
      { ...opts, timeoutMs: 200 },
      new AbortController().signal
    )
    expect(r).toMatchObject({ ok: false, error: { kind: 'timeout' } })
  })

  it('aborts', async () => {
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 50)
    const r = await executeRequest(get(`${base}/slow`), opts, ac.signal)
    expect(r).toMatchObject({ ok: false, error: { kind: 'aborted' } })
  })

  it('connection refused', async () => {
    const s = http.createServer()
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
    const port = (s.address() as AddressInfo).port
    await new Promise<void>((r) => s.close(() => r()))
    const r = await executeRequest(
      get(`http://127.0.0.1:${port}/`),
      opts,
      new AbortController().signal
    )
    expect(r).toMatchObject({
      ok: false,
      error: { kind: 'connection-refused', message: `Connection refused by 127.0.0.1:${port}` }
    })
  })

  it('dns failure', async () => {
    const r = await executeRequest(
      get('http://nonexistent.invalid/'),
      opts,
      new AbortController().signal
    )
    expect(r).toMatchObject({ ok: false, error: { kind: 'dns' } })
  })
})
