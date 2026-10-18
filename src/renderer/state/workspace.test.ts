import { describe, expect, it, vi } from 'vitest'
import type { SendResult } from '../../shared/types'
import { createWorkspaceStore } from './workspace'

const okResult = (status: number): SendResult => ({
  ok: true,
  response: {
    status,
    statusText: 'OK',
    headers: [],
    bodyBase64: '',
    bodyText: null,
    sizeBytes: 0,
    truncated: false,
    timing: { totalMs: 1 },
    finalUrl: 'http://x',
    redirects: []
  } as never
})

type Pending = { requestId: string; resolve(r: SendResult): void; reject(e: unknown): void }

function fakeApi(): {
  api: never
  send: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  pending: Pending[]
} {
  const pending: Pending[] = []
  const send = vi.fn(
    (input: { requestId: string }) =>
      new Promise<SendResult>((resolve, reject) => {
        pending.push({ requestId: input.requestId, resolve, reject })
      })
  )
  const cancel = vi.fn(async () => undefined)
  return { api: { 'request:send': send, 'request:cancel': cancel } as never, send, cancel, pending }
}

describe('workspace store', () => {
  it('has defaults, merges drafts and clamps split', () => {
    const { api } = fakeApi()
    const store = createWorkspaceStore(api)
    expect(store.getState().split).toBe(0.5)
    expect(store.getState().inFlight).toBeNull()
    store.getState().updateDraft({ url: 'http://a' })
    store.getState().updateDraft({ method: 'POST' })
    expect(store.getState().draft).toMatchObject({ url: 'http://a', method: 'POST' })
    store.getState().setSplit(0.05)
    expect(store.getState().split).toBe(0.2)
    store.getState().setSplit(0.95)
    expect(store.getState().split).toBe(0.8)
    store.getState().setSplit(0.6)
    expect(store.getState().split).toBe(0.6)
  })

  it('send sets inFlight; resolving sets result and clears inFlight', async () => {
    const { api, pending, send } = fakeApi()
    const store = createWorkspaceStore(api)
    const p = store.getState().send()
    expect(store.getState().inFlight?.requestId).toBe(pending[0]?.requestId)
    expect(send).toHaveBeenCalledWith({
      requestId: pending[0]?.requestId,
      request: store.getState().draft
    })
    const r = okResult(200)
    pending[0]?.resolve(r)
    await p
    expect(store.getState().result).toBe(r)
    expect(store.getState().inFlight).toBeNull()
  })

  it('ignores a stale result: B wins even if A resolves last', async () => {
    const { api, pending, cancel } = fakeApi()
    const store = createWorkspaceStore(api)
    const a = store.getState().send()
    const b = store.getState().send()
    expect(cancel).toHaveBeenCalledWith({ requestId: pending[0]?.requestId })
    const rb = okResult(201)
    pending[1]?.resolve(rb)
    await b
    pending[0]?.resolve(okResult(500))
    await a
    expect(store.getState().result).toBe(rb)
    expect(store.getState().inFlight).toBeNull()
  })

  it('cancel calls request:cancel with the in-flight id and keeps inFlight', async () => {
    const { api, pending, cancel } = fakeApi()
    const store = createWorkspaceStore(api)
    void store.getState().send()
    store.getState().cancel()
    expect(cancel).toHaveBeenCalledWith({ requestId: pending[0]?.requestId })
    expect(store.getState().inFlight).not.toBeNull()
  })

  it('cancel with nothing in flight is a no-op', () => {
    const { api, cancel } = fakeApi()
    createWorkspaceStore(api).getState().cancel()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('a rejected send becomes a failed result and clears inFlight', async () => {
    const { api, pending } = fakeApi()
    const store = createWorkspaceStore(api)
    const p = store.getState().send()
    pending[0]?.reject(new Error('boom'))
    await p
    expect(store.getState().result).toEqual({
      ok: false,
      error: { kind: 'unknown', message: 'Request failed: boom' }
    })
    expect(store.getState().inFlight).toBeNull()
  })

  it('a stale rejection does not clobber the current request', async () => {
    const { api, pending } = fakeApi()
    const store = createWorkspaceStore(api)
    const a = store.getState().send()
    const b = store.getState().send()
    pending[0]?.reject(new Error('old'))
    await a
    expect(store.getState().result).toBeNull()
    expect(store.getState().inFlight?.requestId).toBe(pending[1]?.requestId)
    pending[1]?.resolve(okResult(200))
    await b
  })
})
