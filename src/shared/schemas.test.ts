import { describe, expect, it } from 'vitest'
import {
  CollectionSchema,
  HistoryEntrySchema,
  SendOutcomeSchema,
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
      'settings:set',
      'environments:list',
      'environments:save',
      'environments:delete',
      'history:list',
      'history:delete',
      'history:clear'
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

  it('defaults activeEnvironmentId to null and rejects a non-UUID', () => {
    expect(
      SettingsSchema.parse({ schemaVersion: 1, split: 0.5, navigatorCollapsed: false })
        .activeEnvironmentId
    ).toBeNull()
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, activeEnvironmentId: 'x' }).success
    ).toBe(false)
    const id = crypto.randomUUID()
    expect(
      SettingsSchema.parse({ ...DEFAULT_SETTINGS, activeEnvironmentId: id }).activeEnvironmentId
    ).toBe(id)
  })
})

describe('HistoryEntrySchema', () => {
  const base = {
    id: '3f2b8c1e-4a5d-4e6f-8a7b-9c0d1e2f3a4b',
    at: '2026-10-19T10:00:00.000Z',
    request: newRequestSpec(),
    status: 200,
    durationMs: 12
  }

  it('round-trips an entry', () => {
    const parsed = HistoryEntrySchema.parse(base)
    expect(parsed).toEqual(base)
    const failed = { ...base, status: null, errorKind: 'dns' }
    expect(HistoryEntrySchema.parse(failed)).toEqual(failed)
  })

  it('rejects status null without errorKind', () => {
    expect(HistoryEntrySchema.safeParse({ ...base, status: null }).success).toBe(false)
  })

  it('rejects a status with errorKind', () => {
    expect(HistoryEntrySchema.safeParse({ ...base, errorKind: 'dns' }).success).toBe(false)
  })

  it('rejects a negative or fractional durationMs', () => {
    expect(HistoryEntrySchema.safeParse({ ...base, durationMs: -1 }).success).toBe(false)
    expect(HistoryEntrySchema.safeParse({ ...base, durationMs: 1.5 }).success).toBe(false)
  })

  it('rejects an at without a Z offset', () => {
    expect(HistoryEntrySchema.safeParse({ ...base, at: '2026-10-19T10:00:00+02:00' }).success).toBe(
      false
    )
  })

  it('SendOutcomeSchema accepts a null history', () => {
    const result: SendResult = { ok: false, error: { kind: 'dns', message: 'x' } }
    expect(SendOutcomeSchema.safeParse({ result, history: null }).success).toBe(true)
  })
})
