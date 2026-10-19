import type { HistoryEntry, RequestSpec, SendResult } from '../shared/types'

export function buildEntry(input: {
  request: RequestSpec
  result: SendResult
  startedAt: number
  endedAt: number
  collectionId?: string
  environmentId?: string
  id: string
}): HistoryEntry {
  const { request, result, startedAt, endedAt, collectionId, environmentId, id } = input
  const base = { id, at: new Date(startedAt).toISOString(), request }
  const ctx = {
    ...(collectionId !== undefined ? { collectionId } : {}),
    ...(environmentId !== undefined ? { environmentId } : {})
  }
  if (result.ok) {
    return {
      ...base,
      status: result.response.status,
      durationMs: result.response.timings.totalMs,
      ...ctx
    }
  }
  return {
    ...base,
    status: null,
    durationMs: Math.max(0, Math.round(endedAt - startedAt)),
    errorKind: result.error.kind,
    ...ctx
  }
}
