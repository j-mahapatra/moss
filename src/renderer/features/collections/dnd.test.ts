import { describe, expect, it } from 'vitest'
import { newCollection, newFolder, toItem } from '../../../shared/collection-tree'
import { newRequestSpec, type Collection } from '../../../shared/types'
import { dropPositionFor, resolveDrop } from './dnd'

const req = (name: string): ReturnType<typeof toItem> => toItem({ ...newRequestSpec(), name })

function seed(): {
  c: Collection
  a: ReturnType<typeof req>
  b: ReturnType<typeof req>
  d: ReturnType<typeof req>
  inner: ReturnType<typeof req>
  folder: ReturnType<typeof newFolder>
  sub: ReturnType<typeof newFolder>
} {
  const inner = req('inner')
  const sub = { ...newFolder('sub'), items: [] }
  const folder = { ...newFolder('folder'), items: [inner, sub] }
  const a = req('a')
  const b = req('b')
  const d = req('d')
  return { c: { ...newCollection('C'), items: [a, folder, b, d] }, a, b, d, inner, folder, sub }
}

describe('dropPositionFor', () => {
  it('splits folders 25/50/25', () => {
    expect(dropPositionFor(0, 100, true)).toBe('before')
    expect(dropPositionFor(24, 100, true)).toBe('before')
    expect(dropPositionFor(25, 100, true)).toBe('inside')
    expect(dropPositionFor(74, 100, true)).toBe('inside')
    expect(dropPositionFor(75, 100, true)).toBe('after')
    expect(dropPositionFor(100, 100, true)).toBe('after')
  })
  it('splits requests in half', () => {
    expect(dropPositionFor(49, 100, false)).toBe('before')
    expect(dropPositionFor(50, 100, false)).toBe('after')
  })
})

describe('resolveDrop', () => {
  it('drops before and after a root sibling using after-removal indexes', () => {
    const { c, a, b, d } = seed()
    expect(resolveDrop(c, a.id, d.id, 'before')).toEqual({ parentId: null, index: 2 })
    expect(resolveDrop(c, a.id, d.id, 'after')).toEqual({ parentId: null, index: 3 })
    expect(resolveDrop(c, d.id, a.id, 'before')).toEqual({ parentId: null, index: 0 })
    expect(resolveDrop(c, d.id, b.id, 'before')).toEqual({ parentId: null, index: 2 })
  })
  it('drops relative to a sibling inside a folder', () => {
    const { c, a, inner, folder, sub } = seed()
    expect(resolveDrop(c, a.id, inner.id, 'after')).toEqual({ parentId: folder.id, index: 1 })
    expect(resolveDrop(c, a.id, sub.id, 'before')).toEqual({ parentId: folder.id, index: 1 })
  })
  it('appends when dropped inside a folder', () => {
    const { c, a, folder } = seed()
    expect(resolveDrop(c, a.id, folder.id, 'inside')).toEqual({ parentId: folder.id, index: 2 })
  })
  it('appends after removal when the dragged item is already in that folder', () => {
    const { c, inner, folder } = seed()
    expect(resolveDrop(c, inner.id, folder.id, 'inside')).toEqual({ parentId: folder.id, index: 1 })
  })
  it('appends to the collection root when dropped inside the collection', () => {
    const { c, inner, a } = seed()
    expect(resolveDrop(c, inner.id, c.id, 'inside')).toEqual({ parentId: null, index: 4 })
    expect(resolveDrop(c, a.id, c.id, 'inside')).toEqual({ parentId: null, index: 3 })
  })
  it('returns null for before/after on the collection row', () => {
    const { c, a } = seed()
    expect(resolveDrop(c, a.id, c.id, 'before')).toBeNull()
    expect(resolveDrop(c, a.id, c.id, 'after')).toBeNull()
  })
  it('returns null for a folder dropped onto itself or a descendant', () => {
    const { c, folder, inner, sub } = seed()
    expect(resolveDrop(c, folder.id, folder.id, 'inside')).toBeNull()
    expect(resolveDrop(c, folder.id, inner.id, 'before')).toBeNull()
    expect(resolveDrop(c, folder.id, sub.id, 'inside')).toBeNull()
  })
  it('returns null for unknown ids and for inside on a request', () => {
    const { c, a, b } = seed()
    expect(resolveDrop(c, 'nope', a.id, 'before')).toBeNull()
    expect(resolveDrop(c, a.id, 'nope', 'before')).toBeNull()
    expect(resolveDrop(c, a.id, b.id, 'inside')).toBeNull()
  })
  it('returns null when the drop resolves to the current position (P5)', () => {
    const { c, a, folder, b } = seed()
    // a is index 0, folder is its next sibling: just before the next sibling is a no-op
    expect(resolveDrop(c, a.id, folder.id, 'before')).toBeNull()
    // b is index 2, folder is its previous sibling: just after the previous sibling is a no-op
    expect(resolveDrop(c, b.id, folder.id, 'after')).toBeNull()
  })
})
