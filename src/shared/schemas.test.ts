import { describe, expect, it } from 'vitest'
import {
  CollectionSchema,
  ItemSchema,
  RequestSpecSchema,
  SendResultSchema,
  SettingsSchema
} from './schemas'
import { SendInputSchema, channels, ipcContract } from './ipc-contract'
import { DEFAULT_SETTINGS, newRequestSpec } from './types'
import type { Collection } from './types'
import type { SendResult } from './types'

describe('schemas', () => {
  it('accepts newRequestSpec()', () => {
    expect(RequestSpecSchema.safeParse(newRequestSpec()).success).toBe(true)
  })

  it('rejects an unknown method', () => {
    expect(RequestSpecSchema.safeParse({ ...newRequestSpec(), method: 'FETCH' }).success).toBe(
      false
    )
  })

  it('rejects a form-data file field with no filePath', () => {
    const spec = {
      ...newRequestSpec(),
      body: { mode: 'form-data', fields: [{ kind: 'file', key: 'f', enabled: true }] }
    }
    expect(RequestSpecSchema.safeParse(spec).success).toBe(false)
  })

  it('rejects a non-UUID requestId on request:send', () => {
    const r = SendInputSchema.safeParse({ requestId: 'nope', request: newRequestSpec() })
    expect(r.success).toBe(false)
    expect(ipcContract['request:send'].input).toBe(SendInputSchema)
  })

  it('round-trips an error SendResult unchanged', () => {
    const sample: SendResult = {
      ok: false,
      error: { kind: 'dns', message: 'not found', detail: 'x' }
    }
    expect(SendResultSchema.parse(sample)).toEqual(sample)
  })

  it('channels equals the contract keys', () => {
    expect([...channels]).toEqual([
      'request:send',
      'request:cancel',
      'dialog:pick-file',
      'response:save',
      'collections:list',
      'collections:save',
      'collections:delete',
      'settings:get',
      'settings:set'
    ])
    expect(Object.keys(ipcContract).sort()).toEqual([...channels].sort())
  })
})

describe('collection schemas', () => {
  const request = (): ReturnType<typeof newRequestSpec> & { kind: 'request' } => ({
    ...newRequestSpec(),
    kind: 'request'
  })
  const deep = (): Collection => ({
    id: crypto.randomUUID(),
    name: 'C',
    variables: [{ key: 'a', value: '1', enabled: true }],
    schemaVersion: 1,
    items: [
      {
        id: crypto.randomUUID(),
        kind: 'folder',
        name: 'L1',
        items: [
          {
            id: crypto.randomUUID(),
            kind: 'folder',
            name: 'L2',
            items: [request()]
          }
        ]
      },
      request()
    ]
  })

  it('round-trips a 3-level collection', () => {
    const c = deep()
    const parsed = CollectionSchema.parse(JSON.parse(JSON.stringify(c)))
    expect(parsed).toEqual(c)
  })
  it('rejects an item with an unknown kind', () => {
    expect(ItemSchema.safeParse({ ...request(), kind: 'other' }).success).toBe(false)
  })
  it('rejects a non-UUID id', () => {
    expect(CollectionSchema.safeParse({ ...deep(), id: 'c1' }).success).toBe(false)
    expect(ItemSchema.safeParse({ ...request(), id: 'r1' }).success).toBe(false)
    expect(RequestSpecSchema.safeParse({ ...newRequestSpec(), id: 'r1' }).success).toBe(false)
  })
  it('validates settings', () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, split: 0.9 }).success).toBe(false)
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, split: 0.1 }).success).toBe(false)
  })
})
