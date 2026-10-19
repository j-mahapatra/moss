import Ajv from 'ajv-draft-04'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newCollection, newFolder, toItem } from '../collection-tree'
import { newRequestSpec } from '../types'
import type { Collection, FormField, Item, RequestAuth, RequestBody, RequestItem } from '../types'
import { countLeftOut, exportFileName, exportPostmanV21 } from './postman-v21-export'
import { importPostmanV21 } from './postman-v21'
import { withoutIds } from './test-helpers'

const schema: object = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/postman-collection-v2.1.0.schema.json'), 'utf8')
)
// The vendored v2.1 schema's variable `type` enum predates Postman's own `secret` type, which the
// export emits; the validator allows it and nothing else is relaxed.
const withSecretType = JSON.parse(
  JSON.stringify(schema).replace(
    '"enum":["string","boolean","any","number"]',
    '"enum":["string","boolean","any","number","secret"]'
  )
) as object
const validate = new Ajv({ strict: false }).compile(withSecretType)

function req(name: string, patch: Partial<RequestItem> = {}): RequestItem {
  return { ...toItem(newRequestSpec()), name, ...patch }
}
const withItems = (name: string, items: Item[]): Collection => ({ ...newCollection(name), items })

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
  { type: 'basic', username: 'u', password: 'p' }
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

/** The documented round-trip exception: secret values and credentials do not survive export. */
const withoutSecrets = (c: Collection): Collection => {
  const strip = (i: Item): Item => {
    if (i.kind === 'folder') return { ...i, items: i.items.map(strip) }
    const a = i.auth
    return {
      ...i,
      auth:
        a.type === 'bearer' ? { ...a, token: '' } : a.type === 'basic' ? { ...a, password: '' } : a
    }
  }
  return {
    ...c,
    items: c.items.map(strip),
    variables: c.variables.map((v) => (v.secret ? { ...v, value: '' } : v))
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
    const files = JSON.stringify(c).split('"kind":"file"').length - 1
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
    expect(exportFileName({ name: 'My API / v2' } as Collection)).toBe(
      'My-API-v2.postman_collection.json'
    )
    expect(exportFileName({ name: '///' } as Collection)).toBe('collection.postman_collection.json')
    expect(exportFileName({ name: 'Café ☕ API' } as Collection)).toBe(
      'Caf-API.postman_collection.json'
    )
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

  it('writes secret variables as empty type secret, keeping disabled', () => {
    expect(exportPostmanV21(planted).variable).toEqual([
      { key: 's', value: '', type: 'secret' },
      { key: 'off', value: '', type: 'secret', disabled: true },
      { key: 'empty', value: '', type: 'secret' },
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

  it('imports type secret as a secret variable', () => {
    const r = importPostmanV21(JSON.parse(JSON.stringify(exportPostmanV21(planted))))
    if (!r.ok) throw new Error(r.error)
    expect(r.collection.variables.map((v) => v.secret === true)).toEqual([true, true, true, false])
    expect(r.collection.variables[3]).not.toHaveProperty('secret')
  })
})
