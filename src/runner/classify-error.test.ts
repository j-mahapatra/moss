import { describe, expect, it } from 'vitest'
import { classifyError } from './classify-error'

const url = new URL('http://example.test:8080/path')
const base = { url, timedOut: false, aborted: false, timeoutMs: 30_000 }
const withCode = (code: string): Error => Object.assign(new Error('x'), { code })

describe('classifyError', () => {
  it('aborted wins over everything', () => {
    const e = classifyError(withCode('ENOTFOUND'), { ...base, aborted: true, timedOut: true })
    expect(e.kind).toBe('aborted')
    expect(e.message).toBe('Request cancelled')
  })
  it('timeout formats seconds', () => {
    expect(classifyError(new Error('x'), { ...base, timedOut: true }).message).toBe(
      'Request timed out after 30s'
    )
    expect(classifyError(new Error('x'), { ...base, timedOut: true, timeoutMs: 200 }).message).toBe(
      'Request timed out after 0.2s'
    )
  })
  it('dns', () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
      const e = classifyError(withCode(code), base)
      expect(e.kind).toBe('dns')
      expect(e.message).toBe("Couldn't resolve host example.test")
    }
  })
  it('connection refused via cause', () => {
    const e = classifyError(
      new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
      base
    )
    expect(e.kind).toBe('connection-refused')
    expect(e.message).toBe('Connection refused by example.test:8080')
  })
  it('tls', () => {
    for (const code of [
      'CERT_HAS_EXPIRED',
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN'
    ]) {
      const e = classifyError(withCode(code), base)
      expect(e.kind).toBe('tls')
      expect(e.message).toBe(`TLS handshake failed (${code})`)
    }
  })
  it('unknown, with detail', () => {
    const err = new Error('boom')
    const e = classifyError(err, base)
    expect(e).toEqual({ kind: 'unknown', message: 'Request failed: boom', detail: String(err) })
  })
  it('handles non-Error values', () => {
    expect(classifyError('weird', base).message).toBe('Request failed: weird')
  })
})
