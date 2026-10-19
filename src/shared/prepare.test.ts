import { describe, expect, it } from 'vitest'
import { prepareRequest } from './prepare'
import { newRequestSpec, type RequestError, type RequestSpec, type ResolvedRequest } from './types'

const kv = (
  key: string,
  value: string,
  enabled = true
): { key: string; value: string; enabled: boolean } => ({
  key,
  value,
  enabled
})
const make = (over: Partial<RequestSpec>): RequestSpec => ({
  ...newRequestSpec(),
  url: 'http://x.io',
  ...over
})
const scope = (o: Record<string, string> = {}): Map<string, string> => new Map(Object.entries(o))

function ok(spec: RequestSpec, s = scope()): ResolvedRequest {
  const r = prepareRequest(spec, s)
  if (!r.ok) throw new Error(`expected ok, got ${r.error.kind}: ${r.error.message}`)
  return r.request
}
function fail(spec: RequestSpec, s = scope()): RequestError {
  const r = prepareRequest(spec, s)
  if (r.ok) throw new Error('expected failure')
  return r.error
}

describe('prepareRequest', () => {
  it('prepends http:// to scheme-less urls', () => {
    expect(ok(make({ url: 'localhost:3000/x' })).url).toBe('http://localhost:3000/x')
  })
  it('resolves variables in the url', () => {
    expect(ok(make({ url: '{{base}}/u' }), scope({ base: 'https://a.io' })).url).toBe(
      'https://a.io/u'
    )
  })
  it('rejects unparsable urls', () => {
    expect(fail(make({ url: 'ht tp://bad' })).kind).toBe('invalid-url')
  })
  it('rejects an empty url with a clear message', () => {
    for (const url of ['', '   ']) {
      const e = fail(make({ url }))
      expect(e.kind).toBe('invalid-url')
      expect(e.message).toBe('Enter a URL to send')
    }
  })
  it('skips enabled header rows that are entirely blank', () => {
    const req = ok(make({ headers: [kv('  ', '  '), kv('X-A', '1')] }))
    expect(req.headers).toEqual([['X-A', '1']])
  })
  it('still rejects a blank header name with a value', () => {
    const e = fail(make({ headers: [kv(' ', 'v')] }))
    expect(e.message).toBe("Header name can't be empty")
  })
  it('rejects non-http schemes', () => {
    const e = fail(make({ url: 'file:///etc/passwd' }))
    expect(e.kind).toBe('invalid-url')
    expect(e.message).toBe('Only http and https URLs are supported')
  })
  it('rejects control characters in header values', () => {
    const e = fail(make({ headers: [kv('X-Evil-Test', '{{v}}')] }), scope({ v: 'a\r\nX-Evil: 1' }))
    expect(e.kind).toBe('invalid-request')
    expect(e.message).toBe('Invalid header "X-Evil-Test"')
  })
  it('rejects empty enabled header names', () => {
    expect(fail(make({ headers: [kv('  ', 'v')] })).kind).toBe('invalid-request')
  })
  it('omits disabled headers', () => {
    expect(ok(make({ headers: [kv('X-A', '1', false)] })).headers).toEqual([])
  })
  it('adds basic auth', () => {
    const r = ok(make({ auth: { type: 'basic', username: 'ada', password: 'lovelace' } }))
    expect(r.headers).toEqual([['Authorization', 'Basic YWRhOmxvdmVsYWNl']])
  })
  it('encodes basic auth as utf-8', () => {
    const r = ok(make({ auth: { type: 'basic', username: 'ü', password: 'p' } }))
    expect(r.headers).toEqual([['Authorization', 'Basic w7w6cA==']])
  })
  it('lets a user Authorization header win over bearer', () => {
    const r = ok(
      make({ headers: [kv('authorization', 'X')], auth: { type: 'bearer', token: 't' } })
    )
    expect(r.headers).toEqual([['authorization', 'X']])
  })
  it('rejects a bearer token containing a newline', () => {
    const e = fail(make({ auth: { type: 'bearer', token: '{{t}}' } }), scope({ t: 'a\nb' }))
    expect(e.kind).toBe('invalid-request')
    expect(e.message).toBe('Invalid header "Authorization"')
  })
  it('adds Content-Type for raw bodies', () => {
    const r = ok(make({ body: { mode: 'raw', contentType: 'application/json', text: '{}' } }))
    expect(r.headers).toContainEqual(['Content-Type', 'application/json'])
    expect(r.body).toEqual({ kind: 'text', text: '{}' })
  })
  it('keeps the user Content-Type for raw bodies', () => {
    const r = ok(
      make({
        headers: [kv('content-type', 'text/plain')],
        body: { mode: 'raw', contentType: 'application/json', text: '{}' }
      })
    )
    expect(r.headers).toEqual([['content-type', 'text/plain']])
  })
  it('encodes urlencoded bodies', () => {
    const r = ok(make({ body: { mode: 'urlencoded', fields: [kv('a', '1'), kv('b', 'x y')] } }))
    expect(r.body).toEqual({ kind: 'text', text: 'a=1&b=x+y' })
    expect(r.headers).toContainEqual(['Content-Type', 'application/x-www-form-urlencoded'])
  })
  it('drops user Content-Type and disabled fields for form-data', () => {
    const r = ok(
      make({
        headers: [kv('Content-Type', 'multipart/form-data')],
        body: {
          mode: 'form-data',
          fields: [
            { kind: 'text', key: 'a', value: '{{v}}', enabled: true },
            { kind: 'file', key: 'f', filePath: '/tmp/x', enabled: true },
            { kind: 'text', key: 'off', value: '1', enabled: false }
          ]
        }
      }),
      scope({ v: 'one' })
    )
    expect(r.headers).toEqual([])
    expect(r.body).toEqual({
      kind: 'form',
      fields: [
        { name: 'a', value: 'one' },
        { name: 'f', filePath: '/tmp/x' }
      ]
    })
  })
  it('rejects an enabled form-data file field with no path', () => {
    const spec = (enabled: boolean): RequestSpec =>
      make({
        body: {
          mode: 'form-data',
          fields: [{ kind: 'file', key: 'avatar', filePath: '', enabled }]
        }
      })
    expect(prepareRequest(spec(true), scope())).toEqual({
      ok: false,
      error: { kind: 'invalid-request', message: 'Choose a file for form field "avatar"' }
    })
    const r = ok(spec(false))
    expect(r.body).toEqual({ kind: 'form', fields: [] })
  })
  it('keeps duplicate headers in order', () => {
    const r = ok(make({ headers: [kv('X-A', '1'), kv('X-A', '2')] }))
    expect(r.headers).toEqual([
      ['X-A', '1'],
      ['X-A', '2']
    ])
  })
})
