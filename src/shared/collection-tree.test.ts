import { describe, expect, it } from 'vitest'
import {
  collectRequestIds,
  duplicateItem,
  findItem,
  insertItem,
  listFolders,
  moveItem,
  newCollection,
  newFolder,
  removeItem,
  renameItem,
  toItem,
  toSpec,
  updateItem
} from './collection-tree'
import type { Collection, Folder, Item, RequestItem } from './types'
import { newRequestSpec } from './types'

const req = (name: string): RequestItem => toItem({ ...newRequestSpec(), name })
const folder = (name: string, items: Item[] = []): Folder => ({ ...newFolder(name), items })
const col = (items: Item[]): Collection => ({ ...newCollection('C'), items })
const names = (items: Item[]): string[] => items.map((i) => i.name)

describe('constructors', () => {
  it('newCollection / newFolder produce fresh empty values', () => {
    const c = newCollection('X')
    expect(c).toMatchObject({ name: 'X', items: [], variables: [], schemaVersion: 1 })
    expect(newCollection('X').id).not.toBe(c.id)
    expect(newFolder('F')).toMatchObject({ kind: 'folder', name: 'F', items: [] })
  })
  it('toItem / toSpec round-trip and strip kind', () => {
    const spec = newRequestSpec()
    const item = toItem(spec)
    expect(item.kind).toBe('request')
    expect(toSpec(item)).toEqual(spec)
    expect('kind' in toSpec(item)).toBe(false)
  })
})

describe('findItem', () => {
  it('locates nested items with parent and index', () => {
    const r = req('r')
    const f = folder('f', [req('x'), r])
    const c = col([req('a'), f])
    expect(findItem(c, r.id)).toEqual({ item: r, parentId: f.id, index: 1 })
    expect(findItem(c, f.id)?.parentId).toBeNull()
    expect(findItem(c, 'nope')).toBeNull()
  })
})

describe('insertItem', () => {
  it('appends at root and inserts at an index', () => {
    const a = req('a')
    const b = req('b')
    const z = req('z')
    const c = col([a, b])
    expect(names(insertItem(c, null, z).items)).toEqual(['a', 'b', 'z'])
    expect(names(insertItem(c, null, z, 1).items)).toEqual(['a', 'z', 'b'])
    expect(names(insertItem(c, null, z, 99).items)).toEqual(['a', 'b', 'z'])
    expect(names(insertItem(c, null, z, -5).items)).toEqual(['z', 'a', 'b'])
  })
  it('inserts into a nested folder', () => {
    const inner = folder('inner', [req('x')])
    const c = col([folder('outer', [inner])])
    const next = insertItem(c, inner.id, req('y'))
    const found = findItem(next, inner.id)?.item as Folder
    expect(names(found.items)).toEqual(['x', 'y'])
  })
  it('returns the same reference for an unknown or non-folder parent', () => {
    const r = req('r')
    const c = col([r])
    expect(insertItem(c, 'nope', req('n'))).toBe(c)
    expect(insertItem(c, r.id, req('n'))).toBe(c)
  })
  it('shares untouched siblings structurally', () => {
    const a = folder('a', [req('a1')])
    const b = folder('b', [req('b1')])
    const c = col([a, b])
    const next = insertItem(c, a.id, req('a2'))
    expect(next).not.toBe(c)
    expect(next.items).not.toBe(c.items)
    expect(next.items[0]).not.toBe(a)
    expect(next.items[1]).toBe(b)
    expect(next.variables).toBe(c.variables)
  })
})

describe('removeItem', () => {
  it('removes a nested request', () => {
    const r = req('r')
    const f = folder('f', [r, req('s')])
    const next = removeItem(col([f]), r.id)
    expect(findItem(next, r.id)).toBeNull()
    expect(names((next.items[0] as Folder).items)).toEqual(['s'])
  })
  it('removes a folder with its contents', () => {
    const r = req('r')
    const f = folder('f', [r])
    const next = removeItem(col([f, req('k')]), f.id)
    expect(names(next.items)).toEqual(['k'])
    expect(findItem(next, r.id)).toBeNull()
  })
  it('returns the same reference for an unknown id', () => {
    const c = col([req('a')])
    expect(removeItem(c, 'nope')).toBe(c)
  })
})

describe('updateItem', () => {
  it('applies fn to a nested item', () => {
    const r = req('r')
    const c = col([folder('f', [r])])
    const next = updateItem(c, r.id, (i) => ({ ...i, name: 'R2' }))
    expect(findItem(next, r.id)?.item.name).toBe('R2')
  })
  it('returns the same reference for an unknown id', () => {
    const c = col([req('a')])
    expect(updateItem(c, 'nope', (i) => i)).toBe(c)
  })
})

describe('renameItem', () => {
  it('trims the name', () => {
    const a = req('a')
    expect(findItem(renameItem(col([a]), a.id, '  New  '), a.id)?.item.name).toBe('New')
  })
  it('returns the same reference for a blank name or unknown id', () => {
    const a = req('a')
    const c = col([a])
    expect(renameItem(c, a.id, '   ')).toBe(c)
    expect(renameItem(c, 'nope', 'x')).toBe(c)
  })
})

describe('moveItem', () => {
  it('reorders within the root', () => {
    const [a, b, c] = [req('a'), req('b'), req('c')]
    const col1 = col([a, b, c])
    expect(names(moveItem(col1, a.id, null, 2).items)).toEqual(['b', 'c', 'a'])
    expect(names(moveItem(col1, c.id, null, 0).items)).toEqual(['c', 'a', 'b'])
  })
  it('moves into a folder', () => {
    const a = req('a')
    const f = folder('f', [req('x')])
    const next = moveItem(col([a, f]), a.id, f.id, 0)
    expect(names(next.items)).toEqual(['f'])
    expect(names((next.items[0] as Folder).items)).toEqual(['a', 'x'])
  })
  it('moves out to the root', () => {
    const r = req('r')
    const f = folder('f', [r])
    const next = moveItem(col([f]), r.id, null, 0)
    expect(names(next.items)).toEqual(['r', 'f'])
    expect((next.items[1] as Folder).items).toEqual([])
  })
  it('returns the same reference when moving a folder into its own child or itself', () => {
    const inner = folder('inner')
    const f = folder('f', [inner])
    const c = col([f])
    expect(moveItem(c, f.id, inner.id, 0)).toBe(c)
    expect(moveItem(c, f.id, f.id, 0)).toBe(c)
  })
  it('returns the same reference for unknown ids or a non-folder target', () => {
    const a = req('a')
    const b = req('b')
    const c = col([a, b])
    expect(moveItem(c, 'nope', null, 0)).toBe(c)
    expect(moveItem(c, a.id, 'nope', 0)).toBe(c)
    expect(moveItem(c, a.id, b.id, 0)).toBe(c)
  })
  it('clamps the index', () => {
    const [a, b] = [req('a'), req('b')]
    expect(names(moveItem(col([a, b]), a.id, null, 99).items)).toEqual(['b', 'a'])
    expect(names(moveItem(col([a, b]), b.id, null, -3).items)).toEqual(['b', 'a'])
  })
})

describe('duplicateItem', () => {
  it('copies a folder with fresh ids everywhere, placed after the original', () => {
    const f = folder('F', [req('one'), req('two')])
    const c = col([req('before'), f, req('after')])
    const res = duplicateItem(c, f.id)
    expect(res).not.toBeNull()
    const { collection, newId } = res!
    expect(names(collection.items)).toEqual(['before', 'F', 'F copy', 'after'])
    const copy = collection.items[2] as Folder
    expect(copy.id).toBe(newId)
    const oldIds = new Set([f.id, ...f.items.map((i) => i.id)])
    for (const id of [copy.id, ...copy.items.map((i) => i.id)]) expect(oldIds.has(id)).toBe(false)
    expect(new Set(collectRequestIds(copy)).size).toBe(2)
    expect(names(copy.items)).toEqual(['one', 'two'])
  })
  it('deep-copies a request', () => {
    const r: RequestItem = {
      ...req('r'),
      params: [{ key: 'a', value: '1', enabled: true }],
      headers: [{ key: 'h', value: 'v', enabled: true }],
      body: { mode: 'urlencoded', fields: [{ key: 'k', value: 'v', enabled: true }] },
      auth: { type: 'bearer', token: 't' }
    }
    const { collection, newId } = duplicateItem(col([r]), r.id)!
    const copy = collection.items[1] as RequestItem
    expect(copy.id).toBe(newId)
    expect(copy.id).not.toBe(r.id)
    expect(copy.name).toBe('r copy')
    expect(copy.params).toEqual(r.params)
    expect(copy.params).not.toBe(r.params)
    expect(copy.params[0]).not.toBe(r.params[0])
    expect(copy.headers).not.toBe(r.headers)
    expect(copy.body).not.toBe(r.body)
    expect(copy.auth).not.toBe(r.auth)
  })
  it('returns null for an unknown id', () => {
    expect(duplicateItem(col([req('a')]), 'nope')).toBeNull()
  })
})

describe('collectRequestIds', () => {
  it('returns own id for a request and descendants for a folder', () => {
    const [a, b] = [req('a'), req('b')]
    const f = folder('f', [a, folder('g', [b])])
    expect(collectRequestIds(a)).toEqual([a.id])
    expect(collectRequestIds(f)).toEqual([a.id, b.id])
    expect(collectRequestIds(folder('empty'))).toEqual([])
  })
})

describe('listFolders', () => {
  it('lists folders depth-first with " / " paths', () => {
    const admin = folder('admin')
    const users = folder('users', [admin, req('r')])
    const other = folder('other')
    const c = col([users, other])
    expect(listFolders(c)).toEqual([
      { id: users.id, path: 'users' },
      { id: admin.id, path: 'users / admin' },
      { id: other.id, path: 'other' }
    ])
  })
})
