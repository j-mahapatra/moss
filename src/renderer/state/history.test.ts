/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers with inferred fake-api types */
import { describe, expect, it, vi } from 'vitest'
import { newCollection, toItem } from '../../shared/collection-tree'
import { HISTORY_CAP } from '../../shared/history'
import {
  newRequestSpec,
  type Collection,
  type HistoryEntry,
  type RequestSpec,
  type SendOutcome,
  type SendResult
} from '../../shared/types'
import { selectActiveCollection, selectScope } from './selectors'
import { noopExtras } from './test-api'
import { createWorkspaceStore } from './workspace'

const okResult: SendResult = {
  ok: true,
  response: {
    status: 200,
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
}

const spec = (url: string, name = 'Untitled request'): RequestSpec => ({
  ...newRequestSpec(),
  name,
  url
})

const entry = (
  url: string,
  collectionId?: string,
  at = '2026-10-19T10:00:00.000Z'
): HistoryEntry => ({
  id: crypto.randomUUID(),
  at,
  request: spec(url),
  status: 200,
  durationMs: 5,
  ...(collectionId ? { collectionId } : {})
})

type Deferred<T> = { resolve(v: T): void; reject(e: unknown): void }
const defer = <T>() => {
  let d!: Deferred<T>
  const promise = new Promise<T>((resolve, reject) => (d = { resolve, reject }))
  return { promise, ...d }
}

function setup(opts: { cols?: Collection[]; entries?: HistoryEntry[] } = {}) {
  const sends: { input: { requestId: string; collectionId?: string }; d: Deferred<SendOutcome> }[] =
    []
  const deletes: Deferred<void>[] = []
  const clears: Deferred<void>[] = []
  const api = {
    ...noopExtras(),
    'request:send': vi.fn((input: { requestId: string; collectionId?: string }) => {
      const d = defer<SendOutcome>()
      sends.push({ input, d })
      return d.promise
    }),
    'request:cancel': vi.fn(async () => undefined),
    'collections:list': vi.fn(async () => ({ collections: opts.cols ?? [], warnings: [] })),
    'history:list': vi.fn(async () => ({ entries: opts.entries ?? [], warnings: [] as string[] })),
    'history:delete': vi.fn(() => {
      const d = defer<void>()
      deletes.push(d)
      return d.promise
    }),
    'history:clear': vi.fn(() => {
      const d = defer<void>()
      clears.push(d)
      return d.promise
    })
  }
  const store = createWorkspaceStore(api as never)
  return { api, store, sends, deletes, clears }
}

const messages = (s: { notices: { tone: string; message: string }[] }) =>
  s.notices.map((n) => [n.tone, n.message])

const colWithVar = (name: string, value: string): Collection => ({
  ...newCollection(name),
  variables: [{ key: 'base', value, enabled: true }]
})

describe('history: init', () => {
  it('loads history newest-first and turns warnings into notices', async () => {
    const e1 = entry('http://new')
    const e2 = entry('http://old')
    const { store, api } = setup({ entries: [e1, e2] })
    api['history:list'].mockResolvedValue({ entries: [e1, e2], warnings: ['history line skipped'] })
    await store.getState().init()
    expect(store.getState().history.map((e) => e.id)).toEqual([e1.id, e2.id])
    expect(messages(store.getState())).toEqual([['warning', 'history line skipped']])
  })

  it('a failed load shows a danger notice', async () => {
    const { store, api } = setup()
    api['history:list'].mockRejectedValue(new Error('unreadable'))
    await store.getState().init()
    expect(store.getState().loaded).toBe(true)
    expect(store.getState().history).toEqual([])
    expect(messages(store.getState())).toEqual([['danger', "Couldn't load history: unreadable"]])
  })

  it('keeps an entry a send prepended while history was still loading', async () => {
    const old = entry('http://old')
    const { store, sends, api } = setup()
    const list = defer<{ entries: HistoryEntry[]; warnings: string[] }>()
    api['history:list'].mockReturnValue(list.promise)
    const init = store.getState().init()
    const p = store.getState().send()
    const fresh = entry('http://fresh')
    sends[0]?.d.resolve({ result: okResult, history: fresh })
    await p
    list.resolve({ entries: [old], warnings: [] })
    await init
    expect(store.getState().history.map((e) => e.id)).toEqual([fresh.id, old.id])
  })
})

describe('history: send', () => {
  it('prepends the returned entry and applies the result', async () => {
    const old = entry('http://old')
    const { store, sends } = setup({ entries: [old] })
    await store.getState().init()
    const p = store.getState().send()
    const e = entry('http://new')
    sends[0]?.d.resolve({ result: okResult, history: e })
    await p
    expect(store.getState().result).toBe(okResult)
    expect(store.getState().history.map((x) => x.id)).toEqual([e.id, old.id])
  })

  it('prepends a stale send entry without applying its result', async () => {
    const { store, sends } = setup()
    await store.getState().init()
    const a = store.getState().send()
    const b = store.getState().send()
    const ea = entry('http://a')
    sends[0]?.d.resolve({ result: okResult, history: ea })
    await a
    expect(store.getState().result).toBeNull()
    expect(store.getState().inFlight?.requestId).toBe(sends[1]?.input.requestId)
    expect(store.getState().history.map((x) => x.id)).toEqual([ea.id])
    const eb = entry('http://b')
    sends[1]?.d.resolve({ result: okResult, history: eb })
    await b
    expect(store.getState().history.map((x) => x.id)).toEqual([eb.id, ea.id])
  })

  it('dedupes by id and trims to HISTORY_CAP', async () => {
    const entries = Array.from({ length: HISTORY_CAP }, (_, i) => entry(`http://x/${i}`))
    const { store, sends } = setup({ entries })
    await store.getState().init()
    const p = store.getState().send()
    const e = entry('http://newest')
    sends[0]?.d.resolve({ result: okResult, history: e })
    await p
    const h = store.getState().history
    expect(h).toHaveLength(HISTORY_CAP)
    expect(h[0]?.id).toBe(e.id)
    expect(h.at(-1)?.id).toBe(entries[HISTORY_CAP - 2]?.id)
    const again = store.getState().send()
    sends[1]?.d.resolve({ result: okResult, history: { ...e, status: 404 } })
    await again
    expect(store.getState().history.filter((x) => x.id === e.id)).toHaveLength(1)
    expect(store.getState().history[0]?.status).toBe(404)
  })

  it('raises the history warning of an outcome as a warning notice, and keeps the result', async () => {
    const { store, sends } = setup()
    await store.getState().init()
    const a = store.getState().send()
    sends[0]?.d.resolve({
      result: okResult,
      history: null,
      historyWarning: "Couldn't save this request to history."
    })
    await a
    expect(store.getState().result).toBe(okResult)
    expect(messages(store.getState())).toEqual([
      ['warning', "Couldn't save this request to history."]
    ])
    const b = store.getState().send()
    sends[1]?.d.resolve({ result: okResult, history: null })
    await b
    expect(messages(store.getState())).toHaveLength(1)
  })

  it('adds nothing for a null outcome history or a rejected send', async () => {
    const { store, sends } = setup()
    await store.getState().init()
    const a = store.getState().send()
    sends[0]?.d.resolve({ result: okResult, history: null })
    await a
    const b = store.getState().send()
    sends[1]?.d.reject(new Error('boom'))
    await b
    expect(store.getState().history).toEqual([])
    expect(store.getState().result).toMatchObject({ ok: false })
  })
})

describe('history: openHistoryEntry', () => {
  it('warns when the entry was truncated, and only then', async () => {
    const t = { ...entry('http://t'), bodyTruncated: true }
    const n = entry('http://n')
    const { store } = setup({ entries: [t, n] })
    await store.getState().init()
    store.getState().openHistoryEntry(n.id)
    expect(store.getState().notices).toEqual([])
    store.getState().openHistoryEntry(t.id)
    expect(messages(store.getState())).toContainEqual([
      'warning',
      "This request's body was too large to keep in full; it was shortened."
    ])
  })

  it('opens a copy of the request with a new id as an unsaved draft scoped to its collection', async () => {
    const col = colWithVar('Col', 'http://col')
    const e = entry('{{base}}/u', col.id)
    const { store, sends } = setup({ cols: [col], entries: [e] })
    await store.getState().init()
    store.getState().setActiveEnvironment(null)
    expect(store.getState().openHistoryEntry(e.id)).toBe('opened')
    const s = store.getState()
    expect({ ...s.draft, id: '' }).toEqual({ ...e.request, id: '' })
    expect(s.draft.id).not.toBe(e.request.id)
    expect(s.draft).not.toBe(e.request)
    expect(s.active).toBeNull()
    expect(s.saved).toBeNull()
    expect(s.draftCollectionId).toBe(col.id)
    expect(selectActiveCollection(s)?.id).toBe(col.id)
    expect(selectScope(s).get('base')).toBe('http://col')

    // The entry's request is a copy: editing the draft leaves history alone.
    store.getState().updateDraft({ headers: [] })
    store.getState().draft.params.push({ key: 'k', value: 'v', enabled: true })
    expect(store.getState().history[0]?.request.params).toEqual([])

    void store.getState().send()
    expect(sends[0]?.input.collectionId).toBe(col.id)
  })

  it('does not change the active environment', async () => {
    const e = entry('http://a')
    const { store } = setup({ entries: [{ ...e, environmentId: crypto.randomUUID() }] })
    await store.getState().init()
    store.getState().openHistoryEntry(e.id)
    expect(store.getState().activeEnvironmentId).toBeNull()
  })

  it('a deleted collection gives draftCollectionId null and no collection scope', async () => {
    const e = entry('http://a', crypto.randomUUID())
    const { store, sends } = setup({ entries: [e] })
    await store.getState().init()
    store.getState().openHistoryEntry(e.id)
    expect(store.getState().draftCollectionId).toBeNull()
    expect(selectActiveCollection(store.getState())).toBeNull()
    void store.getState().send()
    expect(sends[0]?.input).not.toHaveProperty('collectionId')
  })

  it('an unknown id returns opened and changes nothing', async () => {
    const { store } = setup()
    await store.getState().init()
    store.getState().updateDraft({ url: 'http://typed' })
    const before = store.getState().draft
    expect(store.getState().openHistoryEntry(crypto.randomUUID())).toBe('opened')
    expect(store.getState().draft).toBe(before)
  })

  it('an edited unsaved draft needs confirmation; confirmDiscard re-runs the open', async () => {
    const col = newCollection('Col')
    const e = entry('http://hist', col.id)
    const { store } = setup({ cols: [col], entries: [e] })
    await store.getState().init()
    store.getState().updateDraft({ url: 'http://typed' })
    expect(store.getState().openHistoryEntry(e.id)).toBe('confirm-discard')
    expect(store.getState().draft.url).toBe('http://typed')
    expect(store.getState().ui.confirmDiscard).toEqual({ then: 'history', id: e.id })
    store.getState().confirmDiscard()
    expect(store.getState().ui.confirmDiscard).toBeNull()
    expect(store.getState().draft.url).toBe('http://hist')
    expect(store.getState().draftCollectionId).toBe(col.id)
  })

  it('an unedited history draft is left without confirmation; an edited one needs it', async () => {
    const e1 = entry('http://one')
    const e2 = entry('http://two')
    const { store } = setup({ entries: [e1, e2] })
    await store.getState().init()
    store.getState().openHistoryEntry(e1.id)
    expect(store.getState().openHistoryEntry(e2.id)).toBe('opened')
    expect(store.getState().draft.url).toBe('http://two')
    store.getState().updateDraft({ url: 'http://two/edited' })
    expect(store.getState().newRequest()).toBe('confirm-discard')
    expect(store.getState().openHistoryEntry(e1.id)).toBe('confirm-discard')
  })

  it('stashes an edited saved request when opening an entry', async () => {
    const r = spec('http://saved', 'Saved')
    const col: Collection = { ...newCollection('Col'), items: [toItem(r)] }
    const e = entry('http://hist')
    const { store } = setup({ cols: [col], entries: [e] })
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: r.id })
    store.getState().updateDraft({ url: 'http://saved/edited' })
    expect(store.getState().openHistoryEntry(e.id)).toBe('opened')
    expect(store.getState().stash[r.id]?.url).toBe('http://saved/edited')
    expect(store.getState().active).toBeNull()
  })
})

describe('history: draftCollectionId is cleared', () => {
  const opened = async () => {
    const r = spec('http://saved', 'Saved')
    const col: Collection = { ...newCollection('Col'), items: [toItem(r)] }
    const other = newCollection('Other')
    const e = entry('http://hist', col.id)
    const t = setup({ cols: [col, other], entries: [e] })
    await t.store.getState().init()
    t.store.getState().openHistoryEntry(e.id)
    expect(t.store.getState().draftCollectionId).toBe(col.id)
    return { ...t, col, other, r }
  }

  it('by newRequest', async () => {
    const { store } = await opened()
    expect(store.getState().newRequest()).toBe('opened')
    expect(store.getState().draftCollectionId).toBeNull()
  })

  it('by openRequest', async () => {
    const { store, col, r } = await opened()
    store.getState().openRequest({ collectionId: col.id, requestId: r.id })
    expect(store.getState().draftCollectionId).toBeNull()
    expect(selectActiveCollection(store.getState())?.id).toBe(col.id)
  })

  it('by a successful saveAs, which sets active', async () => {
    const { store, other } = await opened()
    expect(
      await store.getState().saveAs({ collectionId: other.id, folderId: null, name: 'Kept' })
    ).toBe('saved')
    const s = store.getState()
    expect(s.draftCollectionId).toBeNull()
    expect(s.active).toEqual({ collectionId: other.id, requestId: s.draft.id })
    expect(selectActiveCollection(s)?.id).toBe(other.id)
  })

  it('when its collection is deleted', async () => {
    const { store, col } = await opened()
    expect(await store.getState().deleteCollection(col.id)).toBe(true)
    expect(store.getState().draftCollectionId).toBeNull()
    expect(store.getState().draft.url).toBe('http://hist')
  })
})

describe('history: delete and clear', () => {
  it('deleteHistoryEntry removes at once and resolves true', async () => {
    const [a, b] = [entry('http://a'), entry('http://b')]
    const { store, api, deletes } = setup({ entries: [a, b] })
    const p = store.getState().deleteHistoryEntry(a.id)
    await vi.waitFor(() => expect(deletes).toHaveLength(1))
    expect(api['history:delete']).toHaveBeenCalledWith({ id: a.id })
    expect(store.getState().history.map((e) => e.id)).toEqual([b.id])
    deletes[0]?.resolve()
    expect(await p).toBe(true)
    expect(store.getState().history.map((e) => e.id)).toEqual([b.id])
    expect(store.getState().notices).toEqual([])
  })

  it('a failed delete restores the entry at its index, keeping a send that landed meanwhile', async () => {
    const [a, b, c] = [entry('http://a'), entry('http://b'), entry('http://c')]
    const { store, deletes, sends } = setup({ entries: [a, b, c] })
    await store.getState().init()
    const p = store.getState().deleteHistoryEntry(b.id)
    expect(store.getState().history.map((e) => e.id)).toEqual([a.id, c.id])
    const s = store.getState().send()
    const fresh = entry('http://fresh')
    sends[0]?.d.resolve({ result: okResult, history: fresh })
    await s
    deletes[0]?.reject(new Error('locked'))
    expect(await p).toBe(false)
    expect(store.getState().history.map((e) => e.id)).toEqual([fresh.id, a.id, b.id, c.id])
    expect(messages(store.getState())).toEqual([
      ['danger', "Couldn't delete the history entry: locked"]
    ])
  })

  it('deleting an unknown id resolves false without calling the api', async () => {
    const { store, api } = setup({ entries: [entry('http://a')] })
    expect(await store.getState().deleteHistoryEntry(crypto.randomUUID())).toBe(false)
    expect(api['history:delete']).not.toHaveBeenCalled()
  })

  it('clearHistory empties at once and resolves true', async () => {
    const { store, api, clears } = setup({ entries: [entry('http://a'), entry('http://b')] })
    const p = store.getState().clearHistory()
    await vi.waitFor(() => expect(clears).toHaveLength(1))
    expect(api['history:clear']).toHaveBeenCalledTimes(1)
    expect(store.getState().history).toEqual([])
    clears[0]?.resolve()
    expect(await p).toBe(true)
    expect(store.getState().history).toEqual([])
  })

  it('a failed clear restores the list, keeping a send that landed meanwhile', async () => {
    const [a, b] = [entry('http://a'), entry('http://b')]
    const { store, clears, sends } = setup({ entries: [a, b] })
    await store.getState().init()
    const p = store.getState().clearHistory()
    const s = store.getState().send()
    const fresh = entry('http://fresh')
    sends[0]?.d.resolve({ result: okResult, history: fresh })
    await s
    clears[0]?.reject(new Error('read-only'))
    expect(await p).toBe(false)
    expect(store.getState().history.map((e) => e.id)).toEqual([fresh.id, a.id, b.id])
    expect(messages(store.getState())).toEqual([['danger', "Couldn't clear history: read-only"]])
  })

  it('a rejected clear rolls back even when the api throws synchronously', async () => {
    const a = entry('http://a')
    const { store, api } = setup({ entries: [a] })
    api['history:clear'].mockImplementation(() => {
      throw new Error('sync')
    })
    expect(await store.getState().clearHistory()).toBe(false)
    expect(store.getState().history.map((e) => e.id)).toEqual([a.id])
    expect(messages(store.getState())).toEqual([['danger', "Couldn't clear history: sync"]])
  })
})
