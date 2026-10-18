import { describe, expect, it } from 'vitest'
import { RequestSpecSchema, SendResultSchema } from './schemas'
import { SendInputSchema, channels, ipcContract } from './ipc-contract'
import { newRequestSpec } from './types'
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
    expect(channels).toEqual(Object.keys(ipcContract))
  })
})
