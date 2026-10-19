import type { HeaderList, RequestError, RequestSpec, ResolvedBody, ResolvedRequest } from './types'
import { resolveTemplate, type VariableScope } from './variables'

export type PrepareResult =
  { ok: true; request: ResolvedRequest } | { ok: false; error: RequestError }

const fail = (kind: RequestError['kind'], message: string): PrepareResult => ({
  ok: false,
  error: { kind, message }
})
const BAD_CHARS = /[\r\n\0]/
const hasHeader = (headers: HeaderList, name: string): boolean =>
  headers.some(([n]) => n.trim().toLowerCase() === name)

function base64Utf8(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function prepareRequest(spec: RequestSpec, scope: VariableScope): PrepareResult {
  const r = (s: string): string => resolveTemplate(s, scope)

  // URL
  let raw = r(spec.url).trim()
  if (raw === '') return fail('invalid-url', 'Enter a URL to send')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `http://${raw}`
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail('invalid-url', `Invalid URL: ${r(spec.url).trim()}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fail('invalid-url', 'Only http and https URLs are supported')
  }

  // Headers
  let headers: HeaderList = []
  for (const h of spec.headers) {
    if (!h.enabled) continue
    const name = r(h.key).trim()
    const value = r(h.value)
    if (name === '' && value.trim() === '') continue
    if (name === '') return fail('invalid-request', "Header name can't be empty")
    if (BAD_CHARS.test(name) || BAD_CHARS.test(value)) {
      return fail('invalid-request', `Invalid header "${name}"`)
    }
    headers.push([name, value])
  }

  // Auth
  if (spec.auth.type !== 'none' && !hasHeader(headers, 'authorization')) {
    const value =
      spec.auth.type === 'bearer'
        ? `Bearer ${r(spec.auth.token)}`
        : `Basic ${base64Utf8(`${r(spec.auth.username)}:${r(spec.auth.password)}`)}`
    if (BAD_CHARS.test(value)) return fail('invalid-request', 'Invalid header "Authorization"')
    headers.push(['Authorization', value])
  }

  // Body
  let body: ResolvedBody | null = null
  const body0 = spec.body
  if (body0.mode === 'raw') {
    body = { kind: 'text', text: r(body0.text) }
    if (!hasHeader(headers, 'content-type')) headers.push(['Content-Type', body0.contentType])
  } else if (body0.mode === 'urlencoded') {
    const pairs = body0.fields
      .filter((f) => f.enabled)
      .map((f): [string, string] => [r(f.key), r(f.value)])
    body = { kind: 'text', text: new URLSearchParams(pairs).toString() }
    if (!hasHeader(headers, 'content-type')) {
      headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
    }
  } else if (body0.mode === 'form-data') {
    headers = headers.filter(([n]) => n.trim().toLowerCase() !== 'content-type')
    const fields: Extract<ResolvedBody, { kind: 'form' }>['fields'] = []
    for (const f of body0.fields) {
      if (!f.enabled) continue
      if (f.kind === 'text') {
        fields.push({ name: r(f.key), value: r(f.value) })
        continue
      }
      const filePath = r(f.filePath)
      if (filePath.trim() === '') {
        return fail('invalid-request', `Choose a file for form field "${r(f.key)}"`)
      }
      fields.push({ name: r(f.key), filePath })
    }
    body = { kind: 'form', fields }
  }

  return { ok: true, request: { method: spec.method, url: url.href, headers, body } }
}
