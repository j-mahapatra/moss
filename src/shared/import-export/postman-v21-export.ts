import type {
  Collection,
  FormField,
  Item,
  KeyValue,
  RequestAuth,
  RequestBody,
  Variable
} from '../types'
import { encode, splitUrl } from '../url-params'
import { LANGUAGE_TYPES } from './postman-v21-parts'

export const POSTMAN_V21_SCHEMA =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

type Row = { key: string; value: string; disabled?: true }
type FormRow =
  | { key: string; value: string; type: 'text'; disabled?: true }
  | { key: string; src: string; type: 'file'; disabled?: true }
type PostmanBody =
  | { mode: 'raw'; raw: string; options: { raw: { language: string } } }
  | { mode: 'urlencoded'; urlencoded: Row[] }
  | { mode: 'formdata'; formdata: FormRow[] }
type PostmanAuth =
  | { type: 'noauth' }
  | { type: 'bearer'; bearer: { key: string; value: string; type: 'string' }[] }
  | { type: 'basic'; basic: { key: string; value: string; type: 'string' }[] }
export type PostmanV21Request = {
  method: string
  header: Row[]
  url: { raw: string; query: Row[] }
  body?: PostmanBody
  auth: PostmanAuth
}
export type PostmanV21Item =
  { name: string; item: PostmanV21Item[] } | { name: string; request: PostmanV21Request }
export type PostmanV21Collection = {
  info: { _postman_id: string; name: string; schema: string }
  item: PostmanV21Item[]
  variable?: (Row & { type?: 'secret' })[]
}

/** Replaces unpaired surrogates with U+FFFD (`toWellFormed` where available), so encoding can't throw. */
export function wellFormed(text: string): string {
  if (typeof text.toWellFormed === 'function') return text.toWellFormed()
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = text.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += text.slice(i, i + 2)
        i++
      } else out += '\ufffd'
    } else out += c >= 0xdc00 && c <= 0xdfff ? '\ufffd' : text[i]
  }
  return out
}

/** A collection variable; a secret one keeps its key and state but never its value. */
const variableRow = (v: Variable): Row & { type?: 'secret' } =>
  v.secret
    ? { key: v.key, value: '', type: 'secret', ...(v.enabled ? {} : { disabled: true as const }) }
    : row(v)

const row = (r: KeyValue): Row =>
  r.enabled ? { key: r.key, value: r.value } : { key: r.key, value: r.value, disabled: true }

/**
 * `url.query[]` with values as they appear in the url text (still encoded): each enabled param
 * takes the next `key=value` part of the query; disabled params, which are not in the url, are
 * encoded. If the counts disagree every row is encoded.
 */
function queryRows(url: string, params: KeyValue[]): Row[] {
  const encoded = (p: KeyValue): Row =>
    row({ ...p, key: encode(wellFormed(p.key)), value: encode(wellFormed(p.value)) })
  // Blank rows are not part of the url and are not emitted.
  params = params.filter((p) => p.key !== '' || p.value !== '')
  const query = splitUrl(url).query
  const parts = query ? query.split('&').filter((part) => part !== '') : []
  if (params.filter((p) => p.enabled).length !== parts.length) return params.map(encoded)
  let next = 0
  return params.map((p) => {
    if (!p.enabled) return encoded(p)
    const part = parts[next++] ?? ''
    const eq = part.indexOf('=')
    return eq === -1
      ? { key: part, value: '' }
      : { key: part.slice(0, eq), value: part.slice(eq + 1) }
  })
}

/** Only the file name: a local path would leak the user's directory layout. */
const baseName = (path: string): string => path.split(/[/\\]/).at(-1) ?? ''

const LANGUAGE_BY_TYPE = new Map(
  Object.entries(LANGUAGE_TYPES).map(([language, type]) => [type, language])
)

function formRow(f: FormField): FormRow {
  const off = f.enabled ? {} : { disabled: true as const }
  return f.kind === 'text'
    ? { key: f.key, value: f.value, type: 'text', ...off }
    : { key: f.key, src: baseName(f.filePath), type: 'file', ...off }
}

function body(b: RequestBody): PostmanBody | undefined {
  switch (b.mode) {
    case 'none':
      return undefined
    case 'raw':
      return {
        mode: 'raw',
        raw: b.text,
        options: { raw: { language: LANGUAGE_BY_TYPE.get(b.contentType) ?? 'text' } }
      }
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: b.fields.map(row) }
    case 'form-data':
      return { mode: 'formdata', formdata: b.fields.map(formRow) }
  }
}

function auth(a: RequestAuth): PostmanAuth {
  switch (a.type) {
    case 'none':
      return { type: 'noauth' }
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: '', type: 'string' }] }
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: a.username, type: 'string' },
          { key: 'password', value: '', type: 'string' }
        ]
      }
  }
}

function item(i: Item): PostmanV21Item {
  if (i.kind === 'folder') return { name: i.name, item: i.items.map(item) }
  const b = body(i.body)
  return {
    name: i.name,
    request: {
      method: i.method,
      header: i.headers.map(row),
      url: { raw: i.url, query: queryRows(i.url, i.params) },
      ...(b ? { body: b } : {}),
      auth: auth(i.auth)
    }
  }
}

/** Converts a collection to a Postman Collection v2.1 document. Pure; never throws on valid input. */
export function exportPostmanV21(c: Collection): PostmanV21Collection {
  return {
    info: { _postman_id: c.id, name: c.name, schema: POSTMAN_V21_SCHEMA },
    item: c.items.map(item),
    ...(c.variables.length > 0 ? { variable: c.variables.map(variableRow) } : {})
  }
}

/** Collection name with each run of characters outside [A-Za-z0-9_.-] replaced by `-`, plus extension. */
export function exportFileName(c: Pick<Collection, 'name'>): string {
  const base = c.name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[-\s]+|[-\s]+$/g, '')
  return `${base || 'collection'}.postman_collection.json`
}

function itemsLeftOut(items: Item[]): number {
  let n = 0
  for (const i of items) {
    if (i.kind === 'folder') n += itemsLeftOut(i.items)
    else if (i.auth.type === 'bearer' && i.auth.token !== '') n++
    else if (i.auth.type === 'basic' && i.auth.password !== '') n++
  }
  return n
}

/** How many non-empty secret variable values and credentials `exportPostmanV21` blanks. */
export function countLeftOut(c: Collection): number {
  return c.variables.filter((v) => v.secret && v.value !== '').length + itemsLeftOut(c.items)
}
