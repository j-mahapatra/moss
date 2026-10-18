/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers with inferred fake-api types */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  findItem,
  insertItem,
  newCollection,
  newFolder,
  renameItem,
  toItem
} from '../../shared/collection-tree'
import {
  newRequestSpec,
  type Collection,
  type RequestSpec,
  type SendResult
} from '../../shared/types'
import { selectActiveCollection, selectDirtyIds } from './selectors'
import { createWorkspaceStore } from './workspace'

type Deferred = { resolve(): void; reject(e: unknown): void }

function setup(initial: Collection[] = [], opts: { hold?: boolean } = {}) {
  const disk = new Map(initial.map((c) => [c.id, structuredClone(c)]))
  const saves: Deferred[] = []
  const sendPending: { resolve(r: SendResult): void }[] = []
  const api = {
    'request:send': vi.fn(
      () => new Promise<SendResult>((resolve) => sendPending.push({ resolve }))
    ),
    'request:cancel': vi.fn(async () => undefined),
    'collections:list': vi.fn(async () => ({
      collections: [...disk.values()],
      warnings: ['bad file skipped']
    })),
    'collections:save': vi.fn((c: Collection) => {
      if (!opts.hold) {
        disk.set(c.id, structuredClone(c))
        return Promise.resolve()
      }
      return new Promise<void>((resolve, reject) => {
        saves.push({
          resolve: () => {
            disk.set(c.id, structuredClone(c))
            resolve()
          },
          reject
        })
      })
    }),
    'collections:delete': vi.fn(async ({ id }: { id: string }) => void disk.delete(id)),
    'settings:get': vi.fn(async () => ({
      settings: { schemaVersion: 1 as const, split: 0.3, navigatorCollapsed: true },
      warnings: ['settings reset']
    })),
    'settings:set': vi.fn(async () => undefined)
  }
  const store = createWorkspaceStore(api as never)
  return { api, store, disk, saves, sendPending }
}

const req = (name: string, url = ''): RequestSpec => ({ ...newRequestSpec(), name, url })

function fixture() {
  const a = req('A')
  const b = req('B')
  const folder = { ...newFolder('F'), items: [toItem(req('Deep'))] }
  const col: Collection = { ...newCollection('Col'), items: [toItem(a), toItem(b), folder] }
  return { a, b, folder, col }
}

afterEach(() => vi.useRealTimers())

describe('init', () => {
  it('loads collections and settings once, turns warnings into notices', async () => {
    const { col } = fixture()
    const { store, api } = setup([col])
    const p = store.getState().init()
    expect(store.getState().init()).toBe(p)
    await p
    expect(store.getState().init()).toBe(p)
    const s = store.getState()
    expect(api['collections:list']).toHaveBeenCalledTimes(1)
    expect(s.loaded).toBe(true)
    expect(s.collections.map((c) => c.id)).toEqual([col.id])
    expect(s.split).toBe(0.3)
    expect(s.navigatorCollapsed).toBe(true)
    expect(s.notices.map((n) => [n.tone, n.message])).toEqual([
      ['warning', 'bad file skipped'],
      ['warning', 'settings reset']
    ])
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(500)
    expect(api['settings:set']).not.toHaveBeenCalled()
  })

  it('becomes loaded with danger notices when loads fail', async () => {
    const { store, api } = setup()
    api['collections:list'].mockRejectedValue(new Error('disk gone'))
    api['settings:get'].mockRejectedValue(new Error('nope'))
    await store.getState().init()
    const s = store.getState()
    expect(s.loaded).toBe(true)
    expect(s.notices.map((n) => [n.tone, n.message])).toEqual([
      ['danger', "Couldn't load your collections: disk gone"],
      ['danger', "Couldn't load settings: nope"]
    ])
  })

  it('does not add a notice identical to one already shown', async () => {
    const { store, api } = setup()
    api['collections:list'].mockResolvedValue({ collections: [], warnings: ['w', 'w'] })
    await store.getState().init()
    expect(store.getState().notices.filter((n) => n.message === 'w')).toHaveLength(1)
    const id = store.getState().notices.at(-1)!.id
    store.getState().dismissNotice(id)
    expect(store.getState().notices.find((n) => n.id === id)).toBeUndefined()
  })
})

describe('drafts', () => {
  it('re-opening the active request keeps the in-flight send and result', async () => {
    const { a, col } = fixture()
    const { store, api, sendPending } = setup([col])
    await store.getState().init()
    const ref = { collectionId: col.id, requestId: a.id }
    store.getState().openRequest(ref)
    const done = store.getState().send()
    const inFlight = store.getState().inFlight
    expect(inFlight).not.toBeNull()
    expect(store.getState().openRequest({ ...ref })).toBe('opened')
    expect(store.getState().inFlight).toBe(inFlight)
    expect(api['request:cancel']).not.toHaveBeenCalled()
    const r = { ok: false, error: { kind: 'network', message: 'x' } } as never
    sendPending[0]!.resolve(r)
    await done
    expect(store.getState().result).toBe(r)
    store.getState().openRequest({ ...ref })
    expect(store.getState().result).toBe(r)
  })

  it('keeps edits when switching away and back (Review Focus 3)', async () => {
    const { a, b, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    const refA = { collectionId: col.id, requestId: a.id }
    store.getState().openRequest(refA)
    store.getState().updateDraft({ url: 'http://edited' })
    expect(selectDirtyIds(store.getState()).has(a.id)).toBe(true)
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    expect(store.getState().draft.id).toBe(b.id)
    expect(selectDirtyIds(store.getState()).has(a.id)).toBe(true)
    store.getState().openRequest(refA)
    expect(store.getState().draft.url).toBe('http://edited')
    expect(selectDirtyIds(store.getState()).has(a.id)).toBe(true)
    expect(await store.getState().saveActive()).toBe('saved')
    expect(selectDirtyIds(store.getState()).size).toBe(0)
    expect(store.getState().stash).toEqual({})
  })

  it('selectDirtyIds returns the same Set while inputs are unchanged', async () => {
    const { a, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    const first = selectDirtyIds(store.getState())
    store.getState().setSplit(0.4)
    expect(selectDirtyIds(store.getState())).toBe(first)
    store.getState().updateDraft({ url: 'x' })
    expect(selectDirtyIds(store.getState())).not.toBe(first)
  })

  it('confirms before discarding an edited unsaved request', async () => {
    const { a, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().updateDraft({ url: 'http://typed' })
    const before = store.getState().draft
    expect(store.getState().openRequest({ collectionId: col.id, requestId: a.id })).toBe(
      'confirm-discard'
    )
    expect(store.getState().draft).toBe(before)
    expect(store.getState().active).toBeNull()
    expect(store.getState().newRequest()).toBe('confirm-discard')
    expect(
      store.getState().openRequest({ collectionId: col.id, requestId: a.id }, { discard: true })
    ).toBe('opened')
    expect(store.getState().draft.id).toBe(a.id)
  })

  it('opens without confirmation when the unsaved draft is blank, and ignores unknown refs', async () => {
    const { a, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    const before = store.getState().draft
    expect(store.getState().openRequest({ collectionId: col.id, requestId: 'nope' })).toBe('opened')
    expect(store.getState().draft).toBe(before)
    expect(store.getState().openRequest({ collectionId: col.id, requestId: a.id })).toBe('opened')
    expect(store.getState().active?.requestId).toBe(a.id)
  })

  it('newRequest stashes the active edit and resets', async () => {
    const { a, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    store.getState().updateDraft({ url: 'u' })
    expect(store.getState().newRequest()).toBe('opened')
    expect(store.getState().active).toBeNull()
    expect(store.getState().saved).toBeNull()
    expect(store.getState().stash[a.id]?.url).toBe('u')
  })

  it('drops the late result of a request left behind', async () => {
    const { a, b, col } = fixture()
    const { store, api, sendPending } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    const sent = store.getState().send()
    const { requestId } = (
      api['request:send'].mock.calls[0] as unknown as [{ requestId: string }]
    )[0]
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    expect(api['request:cancel']).toHaveBeenCalledWith({ requestId })
    expect(store.getState().inFlight).toBeNull()
    expect(store.getState().result).toBeNull()
    sendPending[0]!.resolve({ ok: false, error: { kind: 'unknown', message: 'late' } })
    await sent
    expect(store.getState().result).toBeNull()
  })

  it('send passes collectionId of the active request', async () => {
    const { a, col } = fixture()
    const { store, api } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    void store.getState().send()
    expect(api['request:send']).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: col.id })
    )
  })
})

describe('saving', () => {
  it('saveActive writes the updated item through collections:save', async () => {
    const { a, col } = fixture()
    const { store, api, disk } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    store.getState().updateDraft({ url: 'http://new' })
    await store.getState().saveActive()
    const saved = api['collections:save'].mock.calls[0]![0]
    expect(saved.items.find((i) => i.id === a.id)).toMatchObject({
      url: 'http://new',
      kind: 'request'
    })
    expect(disk.get(col.id)).toEqual(saved)
    expect(store.getState().saved?.url).toBe('http://new')
  })

  it('saveActive on an unsaved request needs a target', async () => {
    const { store, api } = setup()
    expect(await store.getState().saveActive()).toBe('needs-target')
    expect(api['collections:save']).not.toHaveBeenCalled()
  })

  it('saveAs inserts into a nested folder and activates the request', async () => {
    const { folder, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().updateDraft({ url: 'http://x' })
    const id = store.getState().draft.id
    await store.getState().saveAs({ collectionId: col.id, folderId: folder.id, name: '  Mine ' })
    const s = store.getState()
    const f = s.collections[0]!.items.find((i) => i.id === folder.id)
    expect(f?.kind === 'folder' && f.items.map((i) => i.id)).toContain(id)
    expect(s.active).toEqual({ collectionId: col.id, requestId: id })
    expect(s.saved?.name).toBe('Mine')
    expect(s.draft.name).toBe('Mine')
    expect(selectDirtyIds(s).size).toBe(0)
    expect(selectActiveCollection(s)?.id).toBe(col.id)
  })

  it('saveAs falls back to the default name', async () => {
    const { col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    await store.getState().saveAs({ collectionId: col.id, folderId: null, name: '   ' })
    expect(store.getState().saved?.name).toBe('Untitled request')
  })
})

describe('createCollection', () => {
  it('saves, inserts sorted, and defaults the name', async () => {
    const z = { ...newCollection('Zed') }
    const { store, disk } = setup([z])
    await store.getState().init()
    const c = await store.getState().createCollection('  Alpha ')
    expect(c?.name).toBe('Alpha')
    expect(store.getState().collections.map((x) => x.name)).toEqual(['Alpha', 'Zed'])
    expect(disk.has(c!.id)).toBe(true)
    expect((await store.getState().createCollection('  '))?.name).toBe('New collection')
  })

  it('returns null with a danger notice on failure', async () => {
    const { store, api } = setup()
    api['collections:save'].mockRejectedValueOnce(new Error('full'))
    expect(await store.getState().createCollection('X')).toBeNull()
    expect(store.getState().collections).toEqual([])
    expect(store.getState().notices.at(-1)).toMatchObject({
      tone: 'danger',
      message: "Couldn't create collection: full"
    })
  })
})

describe('updateCollection', () => {
  it('skips IPC when fn returns the same reference', async () => {
    const { col } = fixture()
    const { store, api } = setup([col])
    await store.getState().init()
    expect(await store.getState().updateCollection(col.id, (c) => c)).toBe(true)
    expect(api['collections:save']).not.toHaveBeenCalled()
  })

  it('rolls back and notifies on rejection', async () => {
    const { col } = fixture()
    const { store, api } = setup([col])
    await store.getState().init()
    const before = store.getState().collections[0]
    api['collections:save'].mockRejectedValueOnce(new Error('EACCES'))
    expect(await store.getState().updateCollection(col.id, (c) => ({ ...c, name: 'New' }))).toBe(
      false
    )
    expect(store.getState().collections[0]).toEqual(before)
    expect(store.getState().notices.at(-1)).toMatchObject({
      tone: 'danger',
      message: `Couldn't save "Col": EACCES`
    })
  })

  it('serializes rapid updates: the last rename wins on disk and in state', async () => {
    const { col } = fixture()
    const { store, api, disk, saves } = setup([col], { hold: true })
    await store.getState().init()
    const p1 = store.getState().updateCollection(col.id, (c) => ({ ...c, name: 'One' }))
    const p2 = store.getState().updateCollection(col.id, (c) => ({ ...c, name: 'Two' }))
    expect(store.getState().collections[0]!.name).toBe('Two')
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    await Promise.resolve()
    expect(api['collections:save']).toHaveBeenCalledTimes(1)
    saves[0]!.resolve()
    await vi.waitFor(() => expect(saves).toHaveLength(2))
    expect(api['collections:save']).toHaveBeenCalledTimes(2)
    saves[1]!.resolve()
    expect(await Promise.all([p1, p2])).toEqual([true, true])
    expect(disk.get(col.id)!.name).toBe('Two')
    expect(store.getState().collections[0]!.name).toBe('Two')
  })

  it('rolls back only the failed change when a later one is queued', async () => {
    const { col } = fixture()
    const { store, disk, saves } = setup([col], { hold: true })
    await store.getState().init()
    const p1 = store.getState().updateCollection(col.id, (c) => ({ ...c, name: 'One' }))
    const p2 = store.getState().updateCollection(col.id, (c) => ({
      ...c,
      variables: [{ id: 'v', key: 'k', value: 'v', enabled: true } as never]
    }))
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    saves[0]!.reject(new Error('boom'))
    await vi.waitFor(() => expect(saves).toHaveLength(2))
    expect(store.getState().collections[0]!.name).toBe('Col')
    expect(store.getState().collections[0]!.variables).toHaveLength(1)
    saves[1]!.resolve()
    expect(await Promise.all([p1, p2])).toEqual([false, true])
    expect(disk.get(col.id)!.name).toBe('Col')
    expect(disk.get(col.id)!.variables).toHaveLength(1)
  })
})

describe('reconciliation', () => {
  it('keeps the draft as unsaved when the active request disappears (Review Focus 4)', async () => {
    const { folder, col } = fixture()
    const deep = folder.items[0] as RequestSpec & { kind: 'request' }
    const { store } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: deep.id })
    store.getState().updateDraft({ url: 'keep-me' })
    await store.getState().updateCollection(col.id, (c) => ({
      ...c,
      items: c.items.filter((i) => i.id !== folder.id)
    }))
    const s = store.getState()
    expect(s.active).toBeNull()
    expect(s.saved).toBeNull()
    expect(s.draft.url).toBe('keep-me')
  })

  it('removes the stash entry of a deleted request, and deleteCollection reconciles', async () => {
    const { a, b, col } = fixture()
    const { store, api, disk } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    store.getState().updateDraft({ url: 'x' })
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    expect(store.getState().stash[a.id]).toBeDefined()
    await store.getState().updateCollection(col.id, (c) => ({
      ...c,
      items: c.items.filter((i) => i.id !== a.id)
    }))
    expect(store.getState().stash).toEqual({})

    store.getState().updateDraft({ url: 'y' })
    await store.getState().deleteCollection(col.id)
    const s = store.getState()
    expect(api['collections:delete']).toHaveBeenCalledWith({ id: col.id })
    expect(disk.has(col.id)).toBe(false)
    expect(s.collections).toEqual([])
    expect(s.active).toBeNull()
    expect(s.draft.url).toBe('y')
  })

  it('deleteCollection failure leaves state and adds a danger notice', async () => {
    const { col } = fixture()
    const { store, api } = setup([col])
    await store.getState().init()
    api['collections:delete'].mockRejectedValueOnce(new Error('locked'))
    await store.getState().deleteCollection(col.id)
    expect(store.getState().collections).toHaveLength(1)
    expect(store.getState().notices.at(-1)).toMatchObject({ tone: 'danger' })
  })

  it('renaming the active request updates draft and saved and stays clean', async () => {
    const { a, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    await store.getState().updateCollection(col.id, (c) => renameItem(c, a.id, 'Renamed'))
    const s = store.getState()
    expect(s.draft.name).toBe('Renamed')
    expect(s.saved?.name).toBe('Renamed')
    expect(selectDirtyIds(s).size).toBe(0)
  })

  it('renaming a stashed request updates its stash entry', async () => {
    const { a, b, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    store.getState().updateDraft({ url: 'x' })
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    await store.getState().updateCollection(col.id, (c) => renameItem(c, a.id, 'Renamed'))
    expect(store.getState().stash[a.id]?.name).toBe('Renamed')
    expect(store.getState().stash[a.id]?.url).toBe('x')
  })
})

describe('settings', () => {
  it('debounces three setSplit calls into one settings:set with the last value', async () => {
    vi.useFakeTimers()
    const { store, api } = setup()
    store.getState().setSplit(0.3)
    store.getState().setSplit(0.4)
    store.getState().setSplit(0.6)
    await vi.advanceTimersByTimeAsync(299)
    expect(api['settings:set']).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api['settings:set']).toHaveBeenCalledTimes(1)
    expect(api['settings:set']).toHaveBeenCalledWith({
      schemaVersion: 1,
      split: 0.6,
      navigatorCollapsed: false
    })
  })

  it('toggleNavigator persists, and a failed save becomes a warning notice', async () => {
    vi.useFakeTimers()
    const { store, api } = setup()
    api['settings:set'].mockRejectedValueOnce(new Error('ro'))
    store.getState().toggleNavigator()
    expect(store.getState().navigatorCollapsed).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    expect(store.getState().notices.at(-1)).toMatchObject({
      tone: 'warning',
      message: "Couldn't save settings."
    })
  })
})

describe('fix round 1', () => {
  it('keeps the stash free of the active id, so a save clears the dot', async () => {
    const { a, b, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    const refA = { collectionId: col.id, requestId: a.id }
    store.getState().openRequest(refA)
    store.getState().updateDraft({ url: 'x' })
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    store.getState().openRequest(refA)
    expect(store.getState().stash[a.id]).toBeUndefined()
    store.getState().updateDraft({ url: 'xy' })
    expect(await store.getState().saveActive()).toBe('saved')
    expect(selectDirtyIds(store.getState()).size).toBe(0)
    expect(store.getState().stash).toEqual({})
  })

  it('an edit reverted to the saved value is not dirty after reopening', async () => {
    const { a, b, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    const refA = { collectionId: col.id, requestId: a.id }
    store.getState().openRequest(refA)
    store.getState().updateDraft({ url: 'x' })
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    store.getState().openRequest(refA)
    store.getState().updateDraft({ url: '' })
    expect(selectDirtyIds(store.getState()).size).toBe(0)
  })

  it('runs fn once: generated ids match between state and disk', async () => {
    const { col } = fixture()
    const { store, disk } = setup([col])
    await store.getState().init()
    await store.getState().updateCollection(col.id, (c) => insertItem(c, null, newFolder('F')))
    const inState = store.getState().collections[0]!.items.at(-1)!.id
    expect(disk.get(col.id)!.items.at(-1)!.id).toBe(inState)
  })

  it('reconciles against confirmed state: a failed delete leaves active in place', async () => {
    const { a, col } = fixture()
    const { store, saves } = setup([col], { hold: true })
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    const p1 = store.getState().updateCollection(col.id, (c) => ({ ...c, name: 'Renamed' }))
    const p2 = store.getState().updateCollection(col.id, (c) => ({
      ...c,
      items: c.items.filter((i) => i.id !== a.id)
    }))
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    saves[0]!.resolve()
    await vi.waitFor(() => expect(saves).toHaveLength(2))
    expect(store.getState().active?.requestId).toBe(a.id)
    saves[1]!.reject(new Error('nope'))
    expect(await Promise.all([p1, p2])).toEqual([true, false])
    expect(store.getState().active?.requestId).toBe(a.id)
    expect(store.getState().saved).not.toBeNull()
  })

  it('saveAs gives a colliding id a fresh one', async () => {
    const { a, col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    store.getState().newRequest()
    store.getState().updateDraft({ id: a.id })
    expect(
      await store.getState().saveAs({ collectionId: col.id, folderId: null, name: 'Dup' })
    ).toBe('saved')
    const ids = store.getState().collections[0]!.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(store.getState().active?.requestId).not.toBe(a.id)
  })

  it('reports failed saves to callers and shows a danger notice', async () => {
    const { a, col } = fixture()
    const { store, api } = setup([col])
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    api['collections:save'].mockRejectedValueOnce(new Error('e1'))
    expect(await store.getState().saveActive()).toBe('failed')
    expect(store.getState().notices.at(-1)).toMatchObject({ tone: 'danger' })
    expect(selectDirtyIds(store.getState()).size).toBe(0)
    store.getState().newRequest()
    api['collections:save'].mockRejectedValueOnce(new Error('e2'))
    expect(await store.getState().saveAs({ collectionId: col.id, folderId: null, name: 'n' })).toBe(
      'failed'
    )
    expect(store.getState().notices.at(-1)?.message).toContain('e2')
    expect(store.getState().active).toBeNull()
  })

  it('saveAs keeps edits typed while the save was pending', async () => {
    const { col } = fixture()
    const { store, saves } = setup([col], { hold: true })
    await store.getState().init()
    const p = store.getState().saveAs({ collectionId: col.id, folderId: null, name: 'N' })
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    store.getState().updateDraft({ url: 'typed-late' })
    saves[0]!.resolve()
    expect(await p).toBe('saved')
    const s = store.getState()
    expect(s.draft.url).toBe('typed-late')
    expect(s.draft.name).toBe('N')
    expect(selectDirtyIds(s).has(s.draft.id)).toBe(true)
  })
})

describe('final review fixes', () => {
  it("saveAs reports 'gone' (no notice) when the collection or folder vanished", async () => {
    const { col } = fixture()
    const { store } = setup([col])
    await store.getState().init()
    const noticesBefore = store.getState().notices.length
    expect(
      await store.getState().saveAs({ collectionId: 'missing', folderId: null, name: 'n' })
    ).toBe('gone')
    expect(
      await store.getState().saveAs({ collectionId: col.id, folderId: 'no-folder', name: 'n' })
    ).toBe('gone')
    expect(store.getState().notices).toHaveLength(noticesBefore)
  })

  it('saveActive keeps a pending optimistic rename', async () => {
    const { a, col } = fixture()
    const { store, disk, saves } = setup([col], { hold: true })
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    const rename = store.getState().updateCollection(col.id, (c) => renameItem(c, a.id, 'Renamed'))
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    store.getState().updateDraft({ url: 'http://x' })
    const p = store.getState().saveActive()
    saves[0]!.resolve()
    await rename
    await vi.waitFor(() => expect(saves).toHaveLength(2))
    saves[1]!.resolve()
    expect(await p).toBe('saved')
    const onDisk = findItem(disk.get(col.id)!, a.id)?.item
    const inState = findItem(store.getState().collections[0]!, a.id)?.item
    expect(onDisk?.name).toBe('Renamed')
    expect(inState?.name).toBe('Renamed')
  })
})

describe('fix round 2', () => {
  it('saveAs does not retarget the view when the user navigated away during the save', async () => {
    const { a, b, col } = fixture()
    const { store, saves } = setup([col], { hold: true })
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: a.id })
    const p = store.getState().saveAs({ collectionId: col.id, folderId: null, name: 'Copy' })
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    store.getState().openRequest({ collectionId: col.id, requestId: b.id })
    store.getState().updateDraft({ url: 'b-edit' })
    saves[0]!.resolve()
    expect(await p).toBe('saved')
    const s = store.getState()
    expect(s.active?.requestId).toBe(b.id)
    expect(s.draft.id).toBe(b.id)
    expect(s.draft.url).toBe('b-edit')
    expect(s.draft.name).toBe('B')
    expect(s.saved?.id).toBe(b.id)
    expect(s.collections[0]!.items.some((i) => i.name === 'Copy')).toBe(true)
  })
})
