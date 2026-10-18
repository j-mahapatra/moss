import { Agent, FormData, interceptors, request, type Dispatcher } from 'undici'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pipeline, Transform, type Readable } from 'node:stream'
import zlib from 'node:zlib'
import type { HeaderList, ResolvedRequest, RunOptions, SendResult } from '../shared/types'
import { classifyError } from './classify-error'

const dispatchers = new Map<number, Dispatcher>()

function dispatcherFor(maxRedirects: number): Dispatcher {
  let d = dispatchers.get(maxRedirects)
  if (!d) {
    d = new Agent().compose(
      interceptors.redirect({ maxRedirections: maxRedirects, throwOnMaxRedirect: true })
    )
    dispatchers.set(maxRedirects, d)
  }
  return d
}

function toHeaderList(raw: Record<string, string | string[] | undefined>): HeaderList {
  const out: HeaderList = []
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const v of value) out.push([name, v])
    else out.push([name, value])
  }
  return out
}

/**
 * `Content-Encoding: deflate` is zlib-wrapped per the RFC, but some servers send raw
 * DEFLATE. Peek the first byte: a zlib header has CM = 8 in its low nibble (usually 0x78).
 */
function createDeflateDecoder(): Transform {
  let inner: zlib.Inflate | zlib.InflateRaw | null = null
  const out = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (!inner) {
        const first = chunk[0] ?? 0
        inner = (first & 0x0f) === 8 ? zlib.createInflate() : zlib.createInflateRaw()
        inner.on('data', (d: Buffer) => out.push(d))
        inner.on('error', (e) => out.destroy(e))
      }
      inner.write(chunk, () => cb())
    },
    flush(cb) {
      if (!inner) return cb()
      inner.once('end', () => cb())
      inner.end()
    },
    destroy(err, cb) {
      inner?.destroy()
      cb(err)
    }
  })
  return out
}

function decoderFor(encoding: string): zlib.Gunzip | Transform | zlib.BrotliDecompress | null {
  switch (encoding.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip()
    case 'deflate':
      return createDeflateDecoder()
    case 'br':
      return zlib.createBrotliDecompress()
    default:
      return null
  }
}

class InvalidRequestError extends Error {}

async function buildBody(body: NonNullable<ResolvedRequest['body']>): Promise<string | FormData> {
  if (body.kind === 'text') return body.text
  const form = new FormData()
  for (const f of body.fields) {
    if ('filePath' in f) {
      try {
        await fs.promises.stat(f.filePath)
      } catch {
        throw new InvalidRequestError(`File not found: ${f.filePath}`)
      }
      form.append(f.name, await fs.openAsBlob(f.filePath), path.basename(f.filePath))
    } else {
      form.append(f.name, f.value)
    }
  }
  return form
}

export async function executeRequest(
  req: ResolvedRequest,
  options: RunOptions,
  signal: AbortSignal
): Promise<SendResult> {
  let url: URL
  try {
    url = new URL(req.url)
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'invalid-url', message: `Invalid URL: ${req.url}`, detail: String(err) }
    }
  }
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const combined = AbortSignal.any([signal, timeoutSignal])
  const fail = (err: unknown): SendResult => ({
    ok: false,
    error: classifyError(err, {
      url,
      aborted: signal.aborted,
      timedOut: timeoutSignal.aborted && !signal.aborted,
      timeoutMs: options.timeoutMs
    })
  })

  let body: string | FormData | undefined
  try {
    if (req.body) body = await buildBody(req.body)
  } catch (err) {
    if (err instanceof InvalidRequestError) {
      return { ok: false, error: { kind: 'invalid-request', message: err.message } }
    }
    return fail(err)
  }

  const start = performance.now()
  let stream: Readable | undefined
  try {
    const res = await request(url, {
      method: req.method,
      headers: req.headers.flat(),
      body,
      signal: combined,
      dispatcher: dispatcherFor(options.maxRedirects)
    })
    const ttfbMs = Math.round(performance.now() - start)
    const rawBody = res.body as unknown as Readable
    stream = rawBody

    const encoding = res.headers['content-encoding']
    const encodingStr = Array.isArray(encoding) ? (encoding[0] ?? '') : (encoding ?? '')
    const noBody = req.method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304
    const decoder = noBody ? null : decoderFor(encodingStr)
    const source: Readable = decoder
      ? (pipeline(rawBody, decoder, () => {}) as unknown as Readable)
      : rawBody

    const chunks: Buffer[] = []
    let size = 0
    let truncated = false
    for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      const room = options.maxBodyBytes - size
      if (buf.length > room) {
        if (room > 0) chunks.push(buf.subarray(0, room))
        size += Math.max(room, 0)
        truncated = true
        source.destroy()
        rawBody.destroy()
        break
      }
      chunks.push(buf)
      size += buf.length
    }
    const totalMs = Math.round(performance.now() - start)
    const bytes = Buffer.concat(chunks)
    return {
      ok: true,
      response: {
        status: res.statusCode,
        statusText: http.STATUS_CODES[res.statusCode] ?? '',
        headers: toHeaderList(res.headers),
        bodyBase64: bytes.toString('base64'),
        size: bytes.length,
        truncated,
        timings: { ttfbMs, totalMs }
      }
    }
  } catch (err) {
    stream?.destroy()
    return fail(err)
  }
}
