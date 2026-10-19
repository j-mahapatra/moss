import type { Collection, FormField, Item, KeyValue, RequestAuth, RequestBody } from '../types'
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
  variable?: Row[]
}

const row = (r: KeyValue): Row =>
  r.enabled ? { key: r.key, value: r.value } : { key: r.key, value: r.value, disabled: true }

const LANGUAGE_BY_TYPE = new Map(
  Object.entries(LANGUAGE_TYPES).map(([language, type]) => [type, language])
)

function formRow(f: FormField): FormRow {
  const off = f.enabled ? {} : { disabled: true as const }
  return f.kind === 'text'
    ? { key: f.key, value: f.value, type: 'text', ...off }
    : { key: f.key, src: f.filePath, type: 'file', ...off }
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
      return { type: 'bearer', bearer: [{ key: 'token', value: a.token, type: 'string' }] }
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: a.username, type: 'string' },
          { key: 'password', value: a.password, type: 'string' }
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
      url: { raw: i.url, query: i.params.map(row) },
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
    ...(c.variables.length > 0 ? { variable: c.variables.map(row) } : {})
  }
}

/** Collection name with each run of characters outside [A-Za-z0-9_.-] replaced by `-`, plus extension. */
export function exportFileName(c: Pick<Collection, 'name'>): string {
  const base = c.name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[-\s]+|[-\s]+$/g, '')
  return `${base || 'collection'}.postman_collection.json`
}
