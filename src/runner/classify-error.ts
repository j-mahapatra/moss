import type { RequestError } from '../shared/types'

export type ClassifyContext = {
  url: URL
  timedOut: boolean
  aborted: boolean
  timeoutMs: number
}

const TLS_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN'
])

function errorCode(err: unknown): string | undefined {
  const own = (err as { code?: unknown } | null)?.code
  if (typeof own === 'string') return own
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause?.code
  return typeof cause === 'string' ? cause : undefined
}

export function classifyError(err: unknown, ctx: ClassifyContext): RequestError {
  const detail = String(err)
  if (ctx.aborted) return { kind: 'aborted', message: 'Request cancelled', detail }
  if (ctx.timedOut) {
    const seconds = Number((ctx.timeoutMs / 1000).toFixed(3))
    return { kind: 'timeout', message: `Request timed out after ${seconds}s`, detail }
  }
  const code = errorCode(err)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { kind: 'dns', message: `Couldn't resolve host ${ctx.url.hostname}`, detail }
  }
  if (code === 'ECONNREFUSED') {
    return { kind: 'connection-refused', message: `Connection refused by ${ctx.url.host}`, detail }
  }
  if (code && (code.startsWith('CERT_') || code.startsWith('ERR_TLS_') || TLS_CODES.has(code))) {
    return { kind: 'tls', message: `TLS handshake failed (${code})`, detail }
  }
  const msg = err instanceof Error ? err.message : String(err)
  return { kind: 'unknown', message: `Request failed: ${msg}`, detail }
}
