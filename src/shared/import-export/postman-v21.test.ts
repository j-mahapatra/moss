import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CollectionSchema } from '../schemas'
import type { Collection, Folder, Item, KeyValue, RequestItem } from '../types'
import { importPostmanV21 } from './postman-v21'
import type { ImportNote } from './report'
import { withoutIds } from './test-helpers'

const V21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
const V20 = 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'))

const kv = (key: string, value: string, enabled = true): KeyValue => ({ key, value, enabled })

function imported(json: unknown): { collection: Collection; report: ImportNote[] } {
  const r = importPostmanV21(json)
  if (!r.ok) throw new Error(`import failed: ${r.error}`)
  expect(() => CollectionSchema.parse(r.collection)).not.toThrow()
  return r
}

function at(items: Item[], ...names: string[]): Item {
  const [first, ...rest] = names
  const hit = items.find((i) => i.name === first)
  if (!hit) throw new Error(`no item ${first}`)
  if (rest.length === 0) return hit
  if (hit.kind !== 'folder') throw new Error(`${first} is not a folder`)
  return at(hit.items, ...rest)
}
const req = (c: Collection, ...names: string[]): RequestItem => {
  const it = at(c.items, ...names)
  if (it.kind !== 'request') throw new Error('not a request')
  return it
}

function allIds(items: Item[]): string[] {
  return items.flatMap((i) => [i.id, ...(i.kind === 'folder' ? allIds(i.items) : [])])
}

function sourceIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(sourceIds)
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([k, v]) =>
    (k === 'id' || k === '_postman_id') && typeof v === 'string' ? [v] : sourceIds(v)
  )
}

describe('importPostmanV21', () => {
  it('imports v21-basic.json exactly, with an empty report', () => {
    const { collection, report } = imported(fixture('v21-basic.json'))
    expect(report).toEqual([])
    expect(withoutIds(collection)).toEqual({
      id: '<id>',
      name: 'Basic API',
      schemaVersion: 1,
      variables: [],
      items: [
        {
          id: '<id>',
          kind: 'request',
          name: 'List users',
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          params: [kv('page', '1')],
          headers: [kv('Accept', 'application/json')],
          body: { mode: 'none' },
          auth: { type: 'none' }
        },
        {
          id: '<id>',
          kind: 'folder',
          name: 'Accounts',
          items: [
            {
              id: '<id>',
              kind: 'request',
              name: 'Create account',
              method: 'POST',
              url: 'https://api.example.com/accounts',
              params: [],
              headers: [],
              body: { mode: 'raw', contentType: 'application/json', text: '{"name":"Ann"}' },
              auth: { type: 'none' }
            }
          ]
        }
      ]
    })
  })

  describe('v21-everything.json', () => {
    const { collection: c, report } = imported(fixture('v21-everything.json'))

    it('has an empty report', () => expect(report).toEqual([]))

    it('maps collection variables', () => {
      expect(c.name).toBe('Everything')
      expect(c.variables).toEqual([
        kv('baseUrl', 'https://api.example.com'),
        kv('retries', '3'),
        kv('old', 'x', false),
        kv('empty', '')
      ])
    })

    it('keeps nested folders and basic auth with {{vars}} urls', () => {
      const r = req(c, 'Users', 'Admin', 'Delete user')
      expect(r.method).toBe('DELETE')
      expect(r.url).toBe('{{baseUrl}}/users/{{userId}}')
      expect(r.params).toEqual([])
      expect(r.auth).toEqual({ type: 'basic', username: 'admin', password: 's3cret' })
    })

    it('reads url-object queries, disabled rows and bearer auth', () => {
      const r = req(c, 'Users', 'Search users')
      expect(r.params).toEqual([kv('q', 'ann'), kv('limit', '10', false), kv('debug', '')])
      expect(r.url).toBe('{{baseUrl}}/users?q=ann&debug=')
      expect(r.headers).toEqual([kv('Accept', 'application/json'), kv('X-Debug', '1', false)])
      expect(r.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    })

    it('rebuilds a url without raw; string headers; Content-Type overrides language', () => {
      const r = req(c, 'Create note')
      expect(r.url).toBe('https://api.example.com:8443/notes')
      expect(r.headers).toEqual([
        kv('Content-Type', 'application/vnd.moss+xml'),
        kv('X-Trace', 'abc')
      ])
      expect(r.body).toEqual({
        mode: 'raw',
        contentType: 'application/vnd.moss+xml',
        text: '<note/>'
      })
    })

    it('raw without a language is text/plain; params come from the raw url', () => {
      const r = req(c, 'Echo text')
      expect(r.method).toBe('PUT')
      expect(r.params).toEqual([kv('x', '1')])
      expect(r.url).toBe('https://api.example.com/echo?x=1')
      expect(r.body).toEqual({ mode: 'raw', contentType: 'text/plain', text: 'hello' })
    })

    it('maps urlencoded and form-data bodies with disabled rows', () => {
      expect(req(c, 'Login').body).toEqual({
        mode: 'urlencoded',
        fields: [kv('user', 'ann'), kv('remember', 'yes', false)]
      })
      expect(req(c, 'Upload').body).toEqual({
        mode: 'form-data',
        fields: [
          { kind: 'text', key: 'title', value: 'Report', enabled: true },
          { kind: 'text', key: 'draft', value: 'true', enabled: false }
        ]
      })
    })

    it('a string request is a GET named from its url', () => {
      const r = req(c, 'GET /health')
      expect(r.method).toBe('GET')
      expect(r.url).toBe('https://api.example.com/health')
    })

    it('noauth is none; HEAD and OPTIONS are kept', () => {
      expect(req(c, 'Ping')).toMatchObject({ method: 'HEAD', auth: { type: 'none' } })
      expect(req(c, 'Preflight').method).toBe('OPTIONS')
    })
  })

  it.each([
    ['json', 'application/json'],
    ['xml', 'application/xml'],
    ['html', 'text/html'],
    ['javascript', 'application/javascript'],
    ['text', 'text/plain']
  ])('maps raw language %s to %s', (language, contentType) => {
    const { collection } = imported({
      info: { schema: V21 },
      item: [
        {
          name: 'r',
          request: {
            method: 'POST',
            url: 'u',
            body: { mode: 'raw', raw: '', options: { raw: { language } } }
          }
        }
      ]
    })
    expect((collection.items[0] as RequestItem).body).toEqual({
      mode: 'raw',
      contentType,
      text: ''
    })
  })

  it('reports every unsupported part of v21-unsupported.json', () => {
    const { collection, report } = imported(fixture('v21-unsupported.json'))
    expect(report).toEqual([
      { path: '', message: 'Description was not imported' },
      { path: '', message: 'Collection auth was not imported' },
      { path: '', message: 'Collection scripts were not imported' },
      { path: 'Secured', message: 'Folder auth was not imported' },
      { path: 'Secured', message: 'Folder scripts were not imported' },
      { path: 'Secured', message: 'Folder variables were not imported' },
      { path: 'Secured / OAuth call', message: "oauth2 auth isn't supported" },
      { path: 'With scripts', message: 'Scripts were not imported' },
      { path: 'With scripts', message: 'Examples were not imported' },
      { path: 'With scripts', message: 'Request settings were not imported' },
      { path: 'With scripts', message: 'Description was not imported' },
      { path: 'GraphQL', message: "graphql bodies aren't supported" },
      { path: 'Binary', message: "file bodies aren't supported" },
      {
        path: 'Form with file',
        message: 'File for form field "avatar" was not imported; choose it again'
      },
      { path: 'Copy', message: "Method COPY isn't supported; request skipped" },
      { path: 'Disabled body', message: 'Disabled body was not imported' },
      { path: 'Mystery', message: 'Unrecognized item skipped' }
    ])
    expect(collection.items.map((i) => i.name)).toEqual([
      'Secured',
      'With scripts',
      'GraphQL',
      'Binary',
      'Form with file',
      'Disabled body'
    ])
    expect(req(collection, 'Secured', 'OAuth call').auth).toEqual({ type: 'none' })
    expect(req(collection, 'GraphQL').body).toEqual({ mode: 'none' })
    expect(req(collection, 'Binary').body).toEqual({ mode: 'none' })
    expect(req(collection, 'Disabled body').body).toEqual({ mode: 'none' })
    expect(req(collection, 'Form with file').body).toEqual({
      mode: 'form-data',
      fields: [
        { kind: 'text', key: 'name', value: 'a', enabled: true },
        { kind: 'file', key: 'avatar', filePath: '', enabled: true }
      ]
    })
  })

  it('gives every node a fresh, unique UUID', () => {
    const source = fixture('v21-everything.json')
    const { collection } = imported(source)
    const ids = [collection.id, ...allIds(collection.items)]
    expect(ids.length).toBe(12)
    for (const id of ids) expect(id).toMatch(UUID)
    expect(new Set(ids).size).toBe(ids.length)
    const reused = sourceIds(source)
    expect(reused.length).toBe(3)
    for (const id of reused) expect(ids).not.toContain(id)
  })

  describe('bad input never throws', () => {
    it.each<[string, unknown]>([
      ['null', null],
      ['array', []],
      ['string', 'x'],
      ['empty info', { info: {} }],
      ['no info', { item: [] }],
      ['info not an object', { info: 'v2.1' }],
      ['other schema', { info: { schema: 'https://example.com/other.json' } }]
    ])('%s → not a v2.1 collection', (_, json) => {
      expect(importPostmanV21(json)).toEqual({ ok: false, error: 'Not a Postman v2.1 collection' })
    })

    it('rejects v2.0 with a re-export hint', () => {
      expect(importPostmanV21({ info: { name: 'Old', schema: V20 } })).toEqual({
        ok: false,
        error: "Postman v2.0 collections aren't supported; re-export as v2.1"
      })
    })

    it('an item list that is not an array imports nothing, reported', () => {
      const { collection, report } = imported({ info: { schema: V21 }, item: 'nope' })
      expect(collection.items).toEqual([])
      expect(collection.name).toBe('Imported collection')
      expect(report).toEqual([{ path: '', message: 'Item list is not an array; nothing imported' }])
    })

    it('coerces wrong-typed fields and reports unusable structures', () => {
      const { collection, report } = imported({
        info: { schema: V21, name: 42 },
        variable: 'nope',
        item: [
          null,
          7,
          {
            name: 'Odd',
            request: {
              method: 'post',
              url: { raw: 99 },
              header: 5,
              body: 'x',
              auth: { type: 'bearer', bearer: 'nope' }
            }
          },
          { name: '  ', item: [] },
          {
            name: 'Rows',
            request: {
              url: { raw: 'u', query: [null, { key: 1, value: false }] },
              header: [{ key: null }]
            }
          }
        ]
      })
      expect(collection.name).toBe('42')
      const odd = req(collection, 'Odd')
      expect(odd).toMatchObject({ method: 'POST', url: '99', headers: [], body: { mode: 'none' } })
      expect(odd.auth).toEqual({ type: 'bearer', token: '' })
      expect(at(collection.items, 'Folder').kind).toBe('folder')
      const rows = req(collection, 'Rows')
      expect(rows.params).toEqual([kv('1', 'false')])
      expect(rows.headers).toEqual([kv('', '')])
      expect(report).toEqual([
        { path: '', message: 'Collection variables could not be read' },
        { path: '', message: 'Unrecognized item skipped' },
        { path: '', message: 'Unrecognized item skipped' },
        { path: 'Odd', message: 'Headers could not be read' },
        { path: 'Odd', message: 'Body could not be read' },
        { path: 'Odd', message: 'Auth details could not be read' },
        { path: 'Rows', message: 'Some query params could not be read' }
      ])
    })

    it('never throws on hostile shapes', () => {
      const inputs: unknown[] = [
        undefined,
        0,
        true,
        {
          info: { schema: V21 },
          item: [{ item: 'x' }, { request: null }, { request: { url: null } }]
        },
        { info: { schema: V21 }, item: [{ request: { method: {}, url: {}, header: [1, 'a'] } }] },
        { info: { schema: 123 } },
        Object.create(null)
      ]
      for (const json of inputs) expect(() => importPostmanV21(json)).not.toThrow()
    })
  })

  it('truncates folders nested deeper than 32 levels, with a report', () => {
    type Node = { name: string; item: Node[] }
    let chain: Node = { name: 'f40', item: [] }
    for (let n = 39; n >= 1; n--) chain = { name: `f${n}`, item: [chain] }
    const { collection, report } = imported({ info: { schema: V21 }, item: [chain] })
    let depth = 0
    let items = collection.items
    const names: string[] = []
    while (items[0]) {
      const f = items[0] as Folder
      names.push(f.name)
      depth++
      items = f.items
    }
    expect(depth).toBe(32)
    expect(report).toEqual([
      {
        path: names.join(' / ') + ' / f33',
        message: 'Folders nested more than 32 deep were not imported'
      }
    ])
  })
})
