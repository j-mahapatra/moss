import { describe, expect, it } from 'vitest'
import { buildEntry } from './history-recorder'
import { HistoryEntrySchema } from '../shared/schemas'
import { newRequestSpec } from '../shared/types'
import type { HttpResponse, SendResult } from '../shared/types'

const ID = '3b241101-e2bb-4255-8caf-4136c566a962'
const COL = '4b241101-e2bb-4255-8caf-4136c566a963'

const okResult = {
  ok: true,
  response: { status: 201, timings: { totalMs: 42 } } as unknown as HttpResponse
} as SendResult

describe('buildEntry', () => {
  it('records status and the response total time for an ok result', () => {
    const request = newRequestSpec()
    const e = buildEntry({
      request,
      result: okResult,
      startedAt: 1_000,
      endedAt: 9_000,
      collectionId: COL,
      id: ID
    })
    expect(e).toEqual({
      id: ID,
      at: new Date(1_000).toISOString(),
      request,
      status: 201,
      durationMs: 42,
      collectionId: COL
    })
    expect('errorKind' in e).toBe(false)
    expect(HistoryEntrySchema.safeParse(e).success).toBe(true)
  })

  it('records a null status, the error kind and the wall-clock duration for an error', () => {
    const e = buildEntry({
      request: newRequestSpec(),
      result: { ok: false, error: { kind: 'aborted', message: 'x' } },
      startedAt: 1_000,
      endedAt: 1_250.6,
      id: ID
    })
    expect(e.status).toBeNull()
    expect(e.errorKind).toBe('aborted')
    expect(e.durationMs).toBe(251)
    expect(HistoryEntrySchema.safeParse(e).success).toBe(true)
  })

  it('clamps a negative duration to zero', () => {
    const e = buildEntry({
      request: newRequestSpec(),
      result: { ok: false, error: { kind: 'timeout', message: 'x' } },
      startedAt: 5_000,
      endedAt: 4_000,
      id: ID
    })
    expect(e.durationMs).toBe(0)
  })
})
