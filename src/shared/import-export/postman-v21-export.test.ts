import Ajv from 'ajv-draft-04'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { newCollection, newFolder, toItem } from '../collection-tree'
import { newRequestSpec } from '../types'
import type { Collection, FormField, Item, RequestAuth, RequestBody, RequestItem } from '../types'
import { countLeftOut, exportFileName, exportPostmanV21, wellFormed } from './postman-v21-export'
import { importPostmanV21 } from './postman-v21'
import { withoutIds } from './test-helpers'

const schema: object = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/postman-collection-v2.1.0.schema.json'), 'utf8')
)
const validate = new Ajv({ strict: false }).compile(schema)

function req(name: string, patch: Partial<RequestItem> = {}): RequestItem {
  return { ...toItem(newRequestSpec()), name, ...patch }
}
const withItems = (name: string, items: Item[]): Collection => ({ ...newCollection(name), items })

/** Form-data file fields anywhere in the tree. */
const fileFields = (items: Item[]): number =>
  items.reduce(
    (n, i) =>
      n +
      (i.kind === 'folder'
        ? fileFields(i.items)
        : i.body.mode === 'form-data'
          ? i.body.fields.filter((f) => f.kind === 'file').length
          : 0),
    0
  )

const bodies: RequestBody[] = [
  { mode: 'none' },
  { mode: 'raw', contentType: 'application/json', text: '{"a":1}' },
  { mode: 'raw', contentType: 'application/xml', text: '<a/>' },
  { mode: 'raw', contentType: 'text/html', text: '<p>' },
  { mode: 'raw', contentType: 'application/javascript', text: 'x()' },
  { mode: 'raw', contentType: 'text/plain', text: 'hi' },
  {
    mode: 'urlencoded',
    fields: [
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: false }
    ]
  },
  {
    mode: 'form-data',
    fields: [
      { kind: 'text', key: 't', value: 'v', enabled: true },
      { kind: 'text', key: 'off', value: 'v', enabled: false },
      { kind: 'file', key: 'f', filePath: '', enabled: true }
    ]
  }
]
const auths: RequestAuth[] = [
  { type: 'none' },
  { type: 'bearer', token: 'tok' },
  { type: 'basic', username: 'u', password: 'p' },
  { type: 'bearer', token: '{{apiToken}}' },
  { type: 'basic', username: 'u', password: '{{pw}}' }
]

let deep: Item[] = [req('leaf')]
for (let i = 5; i >= 1; i--) {
  const f = newFolder(`level ${i}`)
  f.items = deep
  deep = [f]
}
const combos: Item[] = bodies.flatMap((body, i) =>
  auths.map((auth, j) => req(`b${i} a${j}`, { method: 'POST', body, auth }))
)

/**
 * The documented round-trip exception: secret values and credentials do not survive export,
 * except credentials made only of `{{variable}}` references.
 */
const withoutSecrets = (c: Collection): Collection => {
  const keep = (v: string): string => (/^\s*(\{\{[^{}]+\}\}\s*)+$/.test(v) ? v : '')
  const strip = (i: Item): Item => {
    if (i.kind === 'folder') return { ...i, items: i.items.map(strip) }
    const a = i.auth
    return {
      ...i,
      auth:
        a.type === 'bearer'
          ? { ...a, token: keep(a.token) }
          : a.type === 'basic'
            ? { ...a, password: keep(a.password) }
            : a
    }
  }
  return {
    ...c,
    items: c.items.map(strip),
    variables: c.variables.map((v) => {
      if (!v.secret) return v
      return { key: v.key, value: '', enabled: v.enabled }
    })
  }
}

const cases: [string, Collection][] = [
  ['empty', newCollection('Empty')],
  ['one GET', withItems('One', [req('get', { url: 'https://example.com' })])],
  ['5-deep folders', withItems('Deep', deep)],
  ['every body x auth', withItems('Combos', combos)],
  [
    'disabled rows',
    {
      ...withItems('Disabled', [
        req('r', {
          url: 'https://e.com?a=1',
          params: [
            { key: 'a', value: '1', enabled: true },
            { key: 'b', value: '2', enabled: false }
          ],
          headers: [
            { key: 'X-On', value: '1', enabled: true },
            { key: 'X-Off', value: '2', enabled: false }
          ]
        })
      ]),
      variables: [
        { key: 'v1', value: 'a', enabled: true },
        { key: 'v2', value: 'b', enabled: false }
      ]
    }
  ],
  [
    'variable url',
    withItems('Vars', [
      req('v', {
        url: '{{baseUrl}}/a?x={{x}}',
        params: [{ key: 'x', value: '{{x}}', enabled: true }]
      })
    ])
  ],
  [
    'encoded query text',
    withItems('Encoded', [
      req('e', {
        url: 'https://e.com/p?q=a%20b&t=1+2&debug',
        params: [
          { key: 'q', value: 'a b', enabled: true },
          { key: 'off', value: 'x y', enabled: false },
          { key: 't', value: '1+2', enabled: true },
          { key: 'debug', value: '', enabled: true }
        ]
      })
    ])
  ],
  [
    'secret variables and credentials',
    {
      ...withItems('Sec', [
        req('r', { auth: { type: 'bearer', token: 'TOKEN-1' } }),
        {
          ...newFolder('f'),
          items: [req('b', { auth: { type: 'basic', username: 'u', password: 'PW-1' } })]
        }
      ]),
      variables: [
        { key: 's', value: 'SECRET-1', enabled: true, secret: true },
        { key: 'off', value: 'SECRET-2', enabled: false, secret: true },
        { key: 'plain', value: 'visible', enabled: true }
      ]
    }
  ],
  ['unicode name', withItems('Café ☕ API', [req('Crème ☕', { url: 'https://e.com/ü' })])]
]

describe('exportPostmanV21', () => {
  it.each(cases)('validates against the v2.1 schema: %s', (_n, c) => {
    const out = JSON.parse(JSON.stringify(exportPostmanV21(c)))
    const ok = validate(out)
    expect(validate.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  it.each(cases)('round-trips through the importer: %s', (_n, c) => {
    const r = importPostmanV21(JSON.parse(JSON.stringify(exportPostmanV21(c))))
    if (!r.ok) throw new Error(r.error)
    expect(withoutIds(r.collection)).toEqual(withoutIds(withoutSecrets(c)))
    const files = fileFields(c.items)
    expect(r.report.length).toBe(files)
    for (const n of r.report) expect(n.message).toMatch(/File for form field/)
  })

  it('emits the documented shape', () => {
    const f: FormField = { kind: 'file', key: 'f', filePath: '/x/y', enabled: false }
    const c = withItems('S', [
      req('r', { method: 'POST', body: { mode: 'form-data', fields: [f] } })
    ])
    c.id = 'cid'
    const out = exportPostmanV21(c)
    expect(out.info).toEqual({
      _postman_id: 'cid',
      name: 'S',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    })
    expect('variable' in out).toBe(false)
    const r = (out.item[0] as { request: { body: unknown; auth: unknown } }).request
    expect(r.body).toEqual({
      mode: 'formdata',
      formdata: [{ key: 'f', src: 'y', type: 'file', disabled: true }]
    })
    expect(r.auth).toEqual({ type: 'noauth' })
  })

  const query = (r: Partial<RequestItem>): unknown =>
    (
      exportPostmanV21(withItems('S', [req('r', r)])).item[0] as {
        request: { url: { query: unknown } }
      }
    ).request.url.query

  it('emits query values as they appear in the raw url', () => {
    expect(
      query({
        url: 'https://e.com/p?q=a%20b&t=1+2&debug&l=a,b&e=x@y.com',
        params: [
          { key: 'q', value: 'a b', enabled: true },
          { key: 'off', value: 'x y', enabled: false },
          { key: 't', value: '1+2', enabled: true },
          { key: 'debug', value: '', enabled: true },
          { key: 'l', value: 'a,b', enabled: true },
          { key: 'e', value: 'x@y.com', enabled: true }
        ]
      })
    ).toEqual([
      { key: 'q', value: 'a%20b' },
      { key: 'off', value: 'x%20y', disabled: true },
      { key: 't', value: '1+2' },
      { key: 'debug', value: '' },
      { key: 'l', value: 'a,b' },
      { key: 'e', value: 'x@y.com' }
    ])
  })

  it('encodes every query row when params and raw parts disagree in number', () => {
    expect(
      query({
        url: 'https://e.com/p?q=a%20b',
        params: [
          { key: 'q', value: 'a b', enabled: true },
          { key: 'n', value: '{{v}} w', enabled: true }
        ]
      })
    ).toEqual([
      { key: 'q', value: 'a%20b' },
      { key: 'n', value: '{{v}}%20w' }
    ])
  })

  it('skips blank rows when pairing enabled params with raw parts, and does not emit them', () => {
    expect(
      query({
        url: 'https://e.com/p?q=a%20b',
        params: [
          { key: 'q', value: 'a b', enabled: true },
          { key: '', value: '', enabled: true },
          { key: '', value: '', enabled: false }
        ]
      })
    ).toEqual([{ key: 'q', value: 'a%20b' }])
  })

  it('never throws on lone surrogates; they become U+FFFD before encoding', () => {
    const c = withItems('S', [
      req('r', {
        url: 'https://e.com/p?a=1',
        params: [
          { key: 'a', value: '1', enabled: true },
          { key: 'k\ud800', value: 'v\udc00x', enabled: false },
          { key: 'n', value: '\ud83d', enabled: true }
        ]
      })
    ])
    expect(() => exportPostmanV21(c)).not.toThrow()
    expect(
      query({
        url: 'https://e.com/p',
        params: [{ key: 'k\ud800', value: '\udc00', enabled: false }]
      })
    ).toEqual([{ key: 'k%EF%BF%BD', value: '%EF%BF%BD', disabled: true }])
    expect(() => JSON.stringify(exportPostmanV21(c))).not.toThrow()
  })

  it('exports only the file name of form-data files', () => {
    const fields: FormField[] = [
      { kind: 'file', key: 'a', filePath: '/Users/me/secret/a.png', enabled: true },
      { kind: 'file', key: 'b', filePath: 'C:\\Users\\me\\b.txt', enabled: true }
    ]
    const c = withItems('S', [req('r', { method: 'POST', body: { mode: 'form-data', fields } })])
    const r = exportPostmanV21(c).item[0] as unknown as { request: { body: { formdata: unknown } } }
    expect(r.request.body.formdata).toEqual([
      { key: 'a', src: 'a.png', type: 'file' },
      { key: 'b', src: 'b.txt', type: 'file' }
    ])
    expect(JSON.stringify(exportPostmanV21(c))).not.toContain('secret')
  })

  it('maps unknown raw content types to text and omits body for none', () => {
    const c = withItems('S', [
      req('a', { body: { mode: 'raw', contentType: 'application/foo', text: 'x' } }),
      req('b')
    ])
    const [a, b] = exportPostmanV21(c).item as unknown as {
      request: { body?: { options: { raw: { language: string } } } }
    }[]
    expect(a!.request.body?.options.raw.language).toBe('text')
    expect('body' in b!.request).toBe(false)
  })
})

describe('exportFileName', () => {
  it('sanitizes the name', () => {
    expect(exportFileName({ name: 'My API / v2' })).toBe('My-API-v2.postman_collection.json')
    expect(exportFileName({ name: '///' })).toBe('collection.postman_collection.json')
    expect(exportFileName({ name: 'Café ☕ API' })).toBe('Caf-API.postman_collection.json')
  })
})

describe('secrets', () => {
  const planted: Collection = {
    ...withItems('Sec', [
      req('r', { auth: { type: 'bearer', token: 'TOKEN-1' } }),
      {
        ...newFolder('f'),
        items: [
          {
            ...newFolder('g'),
            items: [req('b', { auth: { type: 'basic', username: 'alice', password: 'PW-1' } })]
          }
        ]
      }
    ]),
    variables: [
      { key: 's', value: 'SECRET-1', enabled: true, secret: true },
      { key: 'off', value: 'SECRET-2', enabled: false, secret: true },
      { key: 'empty', value: '', enabled: true, secret: true },
      { key: 'plain', value: 'visible', enabled: true }
    ]
  }

  it('never contains a planted secret or credential', () => {
    const text = JSON.stringify(exportPostmanV21(planted))
    for (const s of ['SECRET-1', 'SECRET-2', 'TOKEN-1', 'PW-1']) expect(text).not.toContain(s)
    expect(text).toContain('alice')
    expect(text).toContain('visible')
  })

  it('writes secret variables with an empty value and no type, keeping disabled', () => {
    expect(exportPostmanV21(planted).variable).toEqual([
      { key: 's', value: '' },
      { key: 'off', value: '', disabled: true },
      { key: 'empty', value: '' },
      { key: 'plain', value: 'visible' }
    ])
  })

  it('blanks credentials but keeps type and username', () => {
    const out = exportPostmanV21(planted)
    expect(JSON.stringify(out.item[0])).toContain('"token","value":""')
    expect(JSON.stringify(out.item[1])).toContain('"username","value":"alice"')
  })

  it('countLeftOut counts non-empty secret values and credentials at any depth', () => {
    expect(countLeftOut(planted)).toBe(4)
    expect(countLeftOut(newCollection('x'))).toBe(0)
    expect(
      countLeftOut({
        ...withItems('e', [req('r', { auth: { type: 'bearer', token: '' } })]),
        variables: [{ key: 'p', value: 'x', enabled: true }]
      })
    ).toBe(0)
  })

  it('keeps credentials made only of {{variable}} references and does not count them', () => {
    const c = withItems('Refs', [
      req('pure', { auth: { type: 'bearer', token: '{{apiToken}}' } }),
      req('spaced', { auth: { type: 'basic', username: 'u', password: '  {{a}} {{b}} ' } }),
      req('mixed', { auth: { type: 'bearer', token: 'abc{{x}}' } }),
      req('prefixed', { auth: { type: 'basic', username: 'u', password: 'Bearer {{x}}' } })
    ])
    const out = exportPostmanV21(c)
    const authOf = (n: number): unknown =>
      (out.item[n] as { request: { auth: unknown } }).request.auth
    expect(authOf(0)).toEqual({
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{apiToken}}', type: 'string' }]
    })
    expect(authOf(1)).toEqual({
      type: 'basic',
      basic: [
        { key: 'username', value: 'u', type: 'string' },
        { key: 'password', value: '  {{a}} {{b}} ', type: 'string' }
      ]
    })
    expect(JSON.stringify(authOf(2))).toContain('"token","value":""')
    expect(JSON.stringify(authOf(3))).toContain('"password","value":""')
    expect(countLeftOut(c)).toBe(2)
  })

  it('imports type secret as a secret variable', () => {
    const doc = {
      info: {
        name: 'x',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: [],
      variable: [
        { key: 'a', value: 'v', type: 'secret' },
        { key: 'b', value: 'v', type: 'secret', disabled: true },
        { key: 'c', value: 'v', type: 'string' },
        { key: 'd', value: 'v' }
      ]
    }
    const r = importPostmanV21(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.collection.variables.map((v) => v.secret === true)).toEqual([true, true, false, false])
    expect(r.collection.variables[3]).not.toHaveProperty('secret')
  })
})

describe('wellFormed', () => {
  const native = Object.getOwnPropertyDescriptor(String.prototype, 'toWellFormed')
  afterEach(() => {
    if (native) Object.defineProperty(String.prototype, 'toWellFormed', native)
  })
  const samples = [
    'plain',
    'a\uD800b',
    '\uDC00x',
    'end\uD800',
    '\uD83D\uDE00 ok',
    '\uDE00\uD83D',
    ''
  ]

  it('without String.prototype.toWellFormed, replaces lone surrogates like the native method', () => {
    const expected = samples.map((t) => t.toWellFormed())
    Object.defineProperty(String.prototype, 'toWellFormed', {
      value: undefined,
      configurable: true
    })
    expect(typeof ''.toWellFormed).toBe('undefined')
    expect(samples.map(wellFormed)).toEqual(expected)
    expect(wellFormed('a\uD800b')).toBe('a\uFFFDb')
    expect(wellFormed('\uD83D\uDE00')).toBe('\uD83D\uDE00')
  })
})
