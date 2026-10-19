/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import { describe, expect, it, vi } from 'vitest'
import {
  insertItem,
  moveItem,
  newCollection,
  newFolder,
  removeItem,
  renameItem,
  toItem
} from '../../shared/collection-tree'
import { newRequestSpec, type Collection } from '../../shared/types'
import { selectRecentEntries } from './selectors'
import { noopExtras } from './test-api'
import { createWorkspaceStore, RECENT_MAX, type RequestRef } from './workspace'

async function setup(cols: Collection[]) {
  const api = {
    'request:send': vi.fn(() => new Promise<never>(() => {})),
    'request:cancel': vi.fn(async () => undefined),
    ...noopExtras(),
    'collections:list': vi.fn(async () => ({ collections: cols, warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  await store.getState().init()
  return store
}

function fixture(count = 2) {
  const col = newCollection('API')
  const specs = Array.from({ length: count }, (_, i) => ({
    ...newRequestSpec(),
    name: `R${i}`
  }))
  col.items.push(...specs.map(toItem))
  const refs: RequestRef[] = specs.map((s) => ({ collectionId: col.id, requestId: s.id }))
  return { col, refs }
}

describe('recent requests', () => {
  it('starts empty and lists opened requests newest first, without duplicates', async () => {
    const { col, refs } = fixture()
    const [a, b] = refs as [RequestRef, RequestRef]
    const store = await setup([col])
    expect(store.getState().recent).toEqual([])
    store.getState().openRequest(a)
    store.getState().openRequest(b)
    store.getState().openRequest(a)
    expect(store.getState().recent).toEqual([a, b])
  })

  it('does not record an open that needs confirmation or a request that does not exist', async () => {
    const { col, refs } = fixture()
    const [a] = refs as [RequestRef]
    const store = await setup([col])
    store.getState().updateDraft({ url: 'http://edited' })
    expect(store.getState().openRequest(a)).toBe('confirm-discard')
    expect(store.getState().recent).toEqual([])
    store.getState().openRequest({ collectionId: col.id, requestId: 'missing' })
    expect(store.getState().recent).toEqual([])
  })

  it(`keeps at most ${RECENT_MAX}`, async () => {
    const { col, refs } = fixture(12)
    const store = await setup([col])
    for (const ref of refs) store.getState().openRequest(ref)
    expect(RECENT_MAX).toBe(10)
    expect(store.getState().recent).toEqual(refs.slice(2).reverse())
  })

  it('a successful Save As puts the new request first', async () => {
    const { col, refs } = fixture()
    const [a] = refs as [RequestRef]
    const store = await setup([col])
    store.getState().openRequest(a)
    store.getState().newRequest()
    expect(
      await store.getState().saveAs({ collectionId: col.id, folderId: null, name: 'New' })
    ).toBe('saved')
    const active = store.getState().active
    expect(active).not.toBeNull()
    expect(store.getState().recent).toEqual([active, a])
  })

  it('drops a deleted request, and every ref of a deleted collection', async () => {
    const { col, refs } = fixture(3)
    const [a, b, c] = refs as [RequestRef, RequestRef, RequestRef]
    const other = newCollection('Other')
    const solo = { ...newRequestSpec(), name: 'Solo' }
    other.items.push(toItem(solo))
    const soloRef = { collectionId: other.id, requestId: solo.id }
    const store = await setup([col, other])
    for (const ref of [a, b, soloRef, c]) store.getState().openRequest(ref)
    await store.getState().updateCollection(col.id, (x) => removeItem(x, b.requestId))
    expect(store.getState().recent).toEqual([c, soloRef, a])
    await store.getState().deleteCollection(col.id)
    expect(store.getState().recent).toEqual([soloRef])
  })

  it('keeps a moved request, following it into another collection by id', async () => {
    const { col, refs } = fixture()
    const [a, b] = refs as [RequestRef, RequestRef]
    const folder = newFolder('F')
    col.items.push(folder)
    const other = newCollection('Other')
    const store = await setup([col, other])
    store.getState().openRequest(a)
    store.getState().openRequest(b)
    await store.getState().updateCollection(col.id, (x) => moveItem(x, a.requestId, folder.id, 0))
    expect(store.getState().recent).toEqual([b, a])

    const item = col.items.find((i) => i.id === b.requestId)
    if (!item) throw new Error('fixture')
    await store.getState().updateCollection(other.id, (x) => insertItem(x, null, item))
    await store.getState().updateCollection(col.id, (x) => removeItem(x, b.requestId))
    expect(store.getState().recent).toEqual([{ collectionId: other.id, requestId: b.requestId }, a])
  })

  it('resolves entries with live names, methods and collection names, current first', async () => {
    const { col, refs } = fixture()
    const [a, b] = refs as [RequestRef, RequestRef]
    const store = await setup([col])
    store.getState().openRequest(a)
    store.getState().openRequest(b)
    await store.getState().updateCollection(col.id, (x) => renameItem(x, a.requestId, 'Renamed'))
    await store.getState().updateCollection(col.id, (x) => ({ ...x, name: 'Shop' }))
    expect(selectRecentEntries(store.getState())).toEqual([
      { ref: b, name: 'R1', method: 'GET', collectionName: 'Shop' },
      { ref: a, name: 'Renamed', method: 'GET', collectionName: 'Shop' }
    ])
    // A new unsaved request is not current, so the list keeps its recency order.
    store.getState().newRequest()
    expect(selectRecentEntries(store.getState()).map((e) => e.name)).toEqual(['R1', 'Renamed'])
  })
})
