import { z } from 'zod'
import { newCollection, newFolder } from '../collection-tree'
import { requestNameFromUrl } from '../request-name'
import type { HttpMethod, Item, KeyValue, RequestItem } from '../types'
import { applyParams, decode, parseQuery } from '../url-params'
import {
  headerList,
  hasAuth,
  keyValues,
  mapAuth,
  mapBody,
  nonEmpty,
  obj,
  str
} from './postman-v21-parts'
import type { Notes } from './postman-v21-parts'
import { note } from './report'
import type { CollectionImportResult, ImportReport } from './report'

const NOT_V21 = 'Not a Postman v2.1 collection'
const V20 = "Postman v2.0 collections aren't supported; re-export as v2.1"
const MAX_DEPTH = 32
const METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// Lenient read schemas (see postman-v21-parts.ts): shape only, every field optional.
const open = z.unknown().optional()
const ItemRead = z.looseObject({
  name: open,
  item: open,
  request: open,
  response: open,
  event: open,
  auth: open,
  variable: open,
  description: open,
  protocolProfileBehavior: open
})
const RequestRead = z.looseObject({
  method: open,
  url: open,
  header: open,
  body: open,
  auth: open,
  description: open
})
const UrlRead = z.looseObject({
  raw: open,
  protocol: open,
  host: open,
  port: open,
  path: open,
  query: open,
  hash: open,
  variable: open
})

const join = (prefix: string, name: string): string =>
  prefix === '' ? name : `${prefix} / ${name}`

/** Path/host segments: a string, or an array of strings or `{ value }` objects. */
function segments(x: unknown, sep: string): string {
  if (!Array.isArray(x)) return str(x)
  return x.map((s) => str(obj(s)?.['value'] ?? s)).join(sep)
}

const sameRows = (a: KeyValue[], b: KeyValue[]): boolean =>
  a.length === b.length && a.every((r, i) => r.key === b[i]?.key && r.value === b[i]?.value)

/**
 * Params for a verbatim raw url: the `query[]` rows (decoded like `parseQuery`) when their enabled
 * subset matches the raw query, so disabled rows keep their place; otherwise the raw query
 * followed by the disabled rows.
 */
function rawParams(raw: string, rows: KeyValue[]): KeyValue[] {
  const fromRaw = parseQuery(raw)
  const decoded = rows.map((r) => ({ ...r, key: decode(r.key), value: decode(r.value) }))
  if (
    sameRows(
      decoded.filter((r) => r.enabled),
      fromRaw
    )
  )
    return decoded
  return [...fromRaw, ...decoded.filter((r) => !r.enabled)]
}

function mapUrl(x: unknown, add: Notes): { url: string; params: KeyValue[] } {
  const parsed = UrlRead.safeParse(x)
  // The url text is what gets sent, so a raw url is kept verbatim; params are a decoded view.
  if (!parsed.success) return { url: str(x), params: parseQuery(str(x)) }
  const u = parsed.data
  if (Array.isArray(u.variable) && u.variable.length > 0) add('Path variables were not imported')
  let rows: KeyValue[] | null = null
  if (Array.isArray(u.query)) rows = keyValues(u.query, 'query params', add)
  else if (u.query !== undefined && u.query !== null) add('Query params could not be read')

  if (u.raw !== undefined && u.raw !== null) {
    const raw = str(u.raw)
    return { url: raw, params: rows ? rawParams(raw, rows) : parseQuery(raw) }
  }
  const protocol = str(u.protocol)
  const port = str(u.port)
  const path = segments(u.path, '/').replace(/^\//, '')
  const hash = str(u.hash).replace(/^#/, '')
  const built =
    (protocol ? `${protocol}://` : '') +
    segments(u.host, '.') +
    (port ? `:${port}` : '') +
    (path ? `/${path}` : '') +
    (hash ? `#${hash}` : '')
  const params = rows ?? parseQuery(built)
  return { url: applyParams(built, params), params }
}

function mapRequest(
  item: z.infer<typeof ItemRead>,
  prefix: string,
  report: ImportReport
): RequestItem | null {
  const messages: string[] = []
  const add: Notes = (m) => void messages.push(m)
  const name = str(item.name).trim()
  const r = RequestRead.safeParse(
    typeof item.request === 'string' ? { url: item.request } : item.request
  )
  if (!r.success) {
    report.push(note(name ? join(prefix, name) : prefix, 'Unrecognized item skipped'))
    return null
  }
  const req = r.data
  const method =
    req.method === undefined || req.method === null || req.method === ''
      ? 'GET'
      : str(req.method).toUpperCase()
  const { url, params } = mapUrl(req.url, add)
  if (!METHODS.includes(method)) {
    report.push(
      note(
        join(prefix, name || `${method} ${url}`),
        `Method ${method} isn't supported; request skipped`
      )
    )
    return null
  }
  const m = method as HttpMethod
  const headers = headerList(req.header, add)
  const body = mapBody(req.body, headers, add)
  const auth = mapAuth(req.auth, add)
  if (Array.isArray(item.variable) && item.variable.length > 0) {
    add('Request variables were not imported')
  }
  if (nonEmpty(item.event)) add('Scripts were not imported')
  if (nonEmpty(item.response)) add('Examples were not imported')
  if (nonEmpty(item.protocolProfileBehavior)) add('Request settings were not imported')
  if (nonEmpty(req.description) || nonEmpty(item.description)) add('Description was not imported')
  const finalName = name || requestNameFromUrl(m, url)
  const path = join(prefix, finalName)
  for (const message of messages) report.push(note(path, message))
  return {
    id: crypto.randomUUID(),
    kind: 'request',
    name: finalName,
    method: m,
    url,
    params,
    headers,
    body,
    auth
  }
}

/** `depth` is the nesting level of the list's owner: 0 for the collection root. */
function mapItems(list: unknown[], prefix: string, depth: number, report: ImportReport): Item[] {
  const out: Item[] = []
  for (const entry of list) {
    const parsed = ItemRead.safeParse(entry)
    if (!parsed.success) {
      report.push(note(prefix, 'Unrecognized item skipped'))
      continue
    }
    const item = parsed.data
    const name = str(item.name).trim()
    if (Array.isArray(item.item)) {
      const path = join(prefix, name || 'Folder')
      if (depth + 1 > MAX_DEPTH) {
        report.push(note(path, `Folders nested more than ${MAX_DEPTH} deep were not imported`))
        continue
      }
      if (hasAuth(item.auth)) report.push(note(path, 'Folder auth was not imported'))
      if (nonEmpty(item.event)) report.push(note(path, 'Folder scripts were not imported'))
      if (nonEmpty(item.variable)) report.push(note(path, 'Folder variables were not imported'))
      if (nonEmpty(item.description)) report.push(note(path, 'Description was not imported'))
      const folder = newFolder(name || 'Folder')
      folder.items = mapItems(item.item, path, depth + 1, report)
      out.push(folder)
    } else if (item.request !== undefined && item.request !== null) {
      const request = mapRequest(item, prefix, report)
      if (request) out.push(request)
    } else {
      report.push(note(name ? join(prefix, name) : prefix, 'Unrecognized item skipped'))
    }
  }
  return out
}

function convert(json: unknown): CollectionImportResult {
  const root = obj(json)
  const info = obj(root?.['info'])
  if (!root || !info) return { ok: false, error: NOT_V21 }
  const schema = info['schema']
  if (typeof schema !== 'string') return { ok: false, error: NOT_V21 }
  if (schema.includes('/collection/v2.0')) return { ok: false, error: V20 }
  if (!schema.includes('/collection/v2.1')) return { ok: false, error: NOT_V21 }

  const report: ImportReport = []
  const add: Notes = (m) => void report.push(note('', m))
  const collection = newCollection(str(info['name']).trim() || 'Imported collection')
  if (nonEmpty(info['description'])) add('Description was not imported')
  if (hasAuth(root['auth'])) add('Collection auth was not imported')
  if (nonEmpty(root['event'])) add('Collection scripts were not imported')
  collection.variables = keyValues(root['variable'], 'collection variables', add)

  const items = root['item']
  if (Array.isArray(items)) collection.items = mapItems(items, '', 0, report)
  else if (items !== undefined && items !== null) add('Item list is not an array; nothing imported')
  return { ok: true, collection, report }
}

/** Converts a Postman Collection v2.1 document. Never throws; every dropped part is reported. */
export function importPostmanV21(json: unknown): CollectionImportResult {
  try {
    return convert(json)
  } catch {
    return { ok: false, error: 'The collection could not be read' }
  }
}
