import { HISTORY_BODY_MAX } from '../shared/history'
import type { HistoryEntry, RequestSpec, SendResult } from '../shared/types'

/** Cuts a string to at most `max` characters without splitting a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const end = max > 0 && /[\uD800-\uDBFF]/.test(text.charAt(max - 1)) ? max - 1 : max
  return text.slice(0, end)
}

/** Caps the sum of stored body text at HISTORY_BODY_MAX; the rest of the request is untouched. */
function capBody(request: RequestSpec): { request: RequestSpec; truncated: boolean } {
  const { body } = request
  let budget = HISTORY_BODY_MAX
  let truncated = false
  const take = (text: string): string => {
    const out = cut(text, budget)
    if (out.length < text.length) truncated = true
    budget -= out.length
    return out
  }
  let next: RequestSpec['body'] = body
  if (body.mode === 'raw') next = { ...body, text: take(body.text) }
  else if (body.mode === 'urlencoded')
    next = { ...body, fields: body.fields.map((f) => ({ ...f, value: take(f.value) })) }
  else if (body.mode === 'form-data')
    next = {
      ...body,
      fields: body.fields.map((f) => (f.kind === 'text' ? { ...f, value: take(f.value) } : f))
    }
  return truncated ? { request: { ...request, body: next }, truncated } : { request, truncated }
}

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
  const capped = capBody(request)
  const base = {
    id,
    at: new Date(startedAt).toISOString(),
    request: capped.request,
    ...(capped.truncated ? { bodyTruncated: true as const } : {})
  }
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
