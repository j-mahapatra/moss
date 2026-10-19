import { describe, expect, it } from 'vitest'
import { buildEntry } from './history-recorder'
import { HISTORY_BODY_MAX } from '../shared/history'
import { HistoryEntrySchema } from '../shared/schemas'
import { newRequestSpec } from '../shared/types'
import type { HttpResponse, RequestSpec, SendResult } from '../shared/types'

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

describe('buildEntry body cap', () => {
  const build = (body: RequestSpec['body']): ReturnType<typeof buildEntry> =>
    buildEntry({
      request: { ...newRequestSpec(), body },
      result: okResult,
      startedAt: 1,
      endedAt: 2,
      id: ID
    })

  it('stores a 300 KB raw body at the cap and flags it', () => {
    const e = build({ mode: 'raw', contentType: 'text/plain', text: 'a'.repeat(300 * 1024) })
    expect(e.request.body).toEqual({
      mode: 'raw',
      contentType: 'text/plain',
      text: 'a'.repeat(HISTORY_BODY_MAX)
    })
    expect(e.bodyTruncated).toBe(true)
    expect(HistoryEntrySchema.safeParse(e).success).toBe(true)
  })

  it('leaves a body within the cap untouched and unflagged', () => {
    const e = build({ mode: 'raw', contentType: 'text/plain', text: 'a'.repeat(HISTORY_BODY_MAX) })
    expect('bodyTruncated' in e).toBe(false)
    expect(e.request.body).toMatchObject({ text: 'a'.repeat(HISTORY_BODY_MAX) })
  })

  it('spends the budget across urlencoded values in order', () => {
    const half = 'x'.repeat(HISTORY_BODY_MAX - 10)
    const e = build({
      mode: 'urlencoded',
      fields: [
        { key: 'a', value: half, enabled: true },
        { key: 'b', value: 'y'.repeat(100), enabled: true },
        { key: 'c', value: 'z', enabled: true }
      ]
    })
    expect(e.request.body).toEqual({
      mode: 'urlencoded',
      fields: [
        { key: 'a', value: half, enabled: true },
        { key: 'b', value: 'y'.repeat(10), enabled: true },
        { key: 'c', value: '', enabled: true }
      ]
    })
    expect(e.bodyTruncated).toBe(true)
  })

  it('cuts form-data text fields and keeps file fields', () => {
    const e = build({
      mode: 'form-data',
      fields: [
        { kind: 'file', key: 'f', filePath: '/tmp/x', enabled: true },
        { kind: 'text', key: 't', value: 'q'.repeat(HISTORY_BODY_MAX + 5), enabled: true }
      ]
    })
    expect(e.request.body).toEqual({
      mode: 'form-data',
      fields: [
        { kind: 'file', key: 'f', filePath: '/tmp/x', enabled: true },
        { kind: 'text', key: 't', value: 'q'.repeat(HISTORY_BODY_MAX), enabled: true }
      ]
    })
    expect(e.bodyTruncated).toBe(true)
  })
})
