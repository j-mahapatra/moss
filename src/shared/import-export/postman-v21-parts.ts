import { z } from 'zod'
import type { FormField, KeyValue, RequestAuth, RequestBody } from '../types'

// Lenient read schemas: every field optional and untyped, unknown keys kept. They only check
// "is this a plain object"; the mappers below coerce each field and report unusable structures.
const open = z.unknown().optional()
export const Obj = z.looseObject({})
const RowRead = z.looseObject({ key: open, value: open, disabled: open, type: open })
const BodyRead = z.looseObject({
  mode: open,
  disabled: open,
  raw: open,
  urlencoded: open,
  formdata: open,
  options: open
})
const AuthRead = z.looseObject({ type: open })

/** Collects report messages for one path. */
export type Notes = (message: string) => void

export function obj(x: unknown): Record<string, unknown> | null {
  const r = Obj.safeParse(x)
  return r.success ? r.data : null
}

/** Scalar → string: null/undefined → '', objects as JSON. */
export function str(x: unknown): string {
  if (x === null || x === undefined) return ''
  if (typeof x === 'string') return x
  if (typeof x === 'object') {
    try {
      return JSON.stringify(x) ?? ''
    } catch {
      return ''
    }
  }
  return String(x)
}

export const nonEmpty = (x: unknown): boolean =>
  x !== undefined &&
  x !== null &&
  x !== '' &&
  !(Array.isArray(x) && x.length === 0) &&
  !(typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 0)

type Row = z.infer<typeof RowRead>

/** Object rows of a list; `null` if the list itself is unusable. Non-object entries are reported. */
function rowList(x: unknown, what: string, add: Notes): Row[] | null {
  if (!Array.isArray(x)) return null
  const rows: Row[] = []
  for (const entry of x) {
    const r = RowRead.safeParse(entry)
    if (r.success) rows.push(r.data)
  }
  if (rows.length < x.length) add(`Some ${what} could not be read`)
  return rows
}

const toKv = (r: Row): KeyValue => ({
  key: str(r.key),
  value: str(r.value),
  enabled: r.disabled !== true
})

/** Rows as key/values; absent → [], unusable → [] with `<What> could not be read`. */
export function keyValues(x: unknown, what: string, add: Notes): KeyValue[] {
  if (x === undefined || x === null) return []
  const rows = rowList(x, what, add)
  if (!rows) {
    add(`${what[0]!.toUpperCase()}${what.slice(1)} could not be read`)
    return []
  }
  return rows.map(toKv)
}

/** Headers as an array of rows or a string of `Key: value` lines. */
export function headerList(x: unknown, add: Notes): KeyValue[] {
  if (typeof x !== 'string') return keyValues(x, 'headers', add)
  return x
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const colon = line.indexOf(':')
      return colon === -1
        ? { key: line.trim(), value: '', enabled: true }
        : { key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim(), enabled: true }
    })
}

export const LANGUAGE_TYPES: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
  text: 'text/plain'
}

function rawContentType(options: unknown, headers: KeyValue[], add: Notes): string {
  const header = headers.find((h) => h.enabled && h.key.toLowerCase() === 'content-type')
  if (header) return header.value
  const language = obj(obj(options)?.['raw'])?.['language']
  if (language === undefined || language === null || language === '') return 'text/plain'
  const type = LANGUAGE_TYPES[str(language)]
  if (type) return type
  add(`Raw language "${str(language)}" was imported as text/plain`)
  return 'text/plain'
}

function formFields(x: unknown, add: Notes): FormField[] {
  const rows = rowList(x, 'form fields', add)
  if (!rows) {
    if (x !== undefined && x !== null) add('Form fields could not be read')
    return []
  }
  return rows.map((r): FormField => {
    const { key, value, enabled } = toKv(r)
    if (r.type !== 'file') return { kind: 'text', key, value, enabled }
    add(`File for form field "${key}" was not imported; choose it again`)
    return { kind: 'file', key, filePath: '', enabled }
  })
}

/** Maps a v2.1 `body`; `headers` are the request's, for the Content-Type override. */
export function mapBody(x: unknown, headers: KeyValue[], add: Notes): RequestBody {
  if (x === undefined || x === null) return { mode: 'none' }
  const parsed = BodyRead.safeParse(x)
  if (!parsed.success) {
    add('Body could not be read')
    return { mode: 'none' }
  }
  const b = parsed.data
  if (b.mode === undefined || b.mode === null || b.mode === '') return { mode: 'none' }
  if (b.disabled === true) {
    add('Disabled body was not imported')
    return { mode: 'none' }
  }
  switch (b.mode) {
    case 'raw':
      return { mode: 'raw', contentType: rawContentType(b.options, headers, add), text: str(b.raw) }
    case 'urlencoded':
      return { mode: 'urlencoded', fields: keyValues(b.urlencoded, 'form fields', add) }
    case 'formdata':
      return { mode: 'form-data', fields: formFields(b.formdata, add) }
    default:
      add(`${str(b.mode)} bodies aren't supported`)
      return { mode: 'none' }
  }
}

/** Value of `name` in v2.1 auth params (an array of rows; v2.0-style objects tolerated). */
function authParam(x: unknown, name: string): string | null {
  if (Array.isArray(x)) {
    const row = x.map((e) => RowRead.safeParse(e)).find((r) => r.success && r.data.key === name)
    return row?.success ? str(row.data.value) : ''
  }
  const o = obj(x)
  return o ? str(o[name]) : null
}

/** Maps a request's v2.1 `auth`. */
export function mapAuth(x: unknown, add: Notes): RequestAuth {
  if (x === undefined || x === null) return { type: 'none' }
  const parsed = AuthRead.safeParse(x)
  if (!parsed.success) {
    add('Auth could not be read')
    return { type: 'none' }
  }
  const a = parsed.data
  const unreadable = (v: string | null): string => {
    if (v === null) add('Auth details could not be read')
    return v ?? ''
  }
  switch (a.type) {
    case undefined:
    case null:
    case 'noauth':
      return { type: 'none' }
    case 'bearer':
      return { type: 'bearer', token: unreadable(authParam(a['bearer'], 'token')) }
    case 'basic': {
      const params = a['basic']
      const username = authParam(params, 'username')
      const password = authParam(params, 'password')
      return {
        type: 'basic',
        username: unreadable(username),
        password: username === null ? '' : (password ?? '')
      }
    }
    default:
      add(`${str(a.type)} auth isn't supported`)
      return { type: 'none' }
  }
}

/** True when a folder/collection auth is present and actually sets something. */
export const hasAuth = (x: unknown): boolean => {
  if (x === undefined || x === null) return false
  const o = obj(x)
  if (!o) return true
  return o['type'] !== 'noauth' && o['type'] !== undefined && o['type'] !== null
}
