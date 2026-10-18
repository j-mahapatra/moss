import type { Collection, Folder, Item, RequestItem, RequestSpec } from './types'

export type ParentRef = string | null

export function newCollection(name: string): Collection {
  return { id: crypto.randomUUID(), name, items: [], variables: [], schemaVersion: 1 }
}

export function newFolder(name: string): Folder {
  return { id: crypto.randomUUID(), kind: 'folder', name, items: [] }
}

export function toItem(spec: RequestSpec): RequestItem {
  return { ...spec, kind: 'request' }
}

export function toSpec(item: RequestItem): RequestSpec {
  const spec: Partial<RequestItem> = { ...item }
  delete spec.kind
  return spec as RequestSpec
}

export function findItem(
  c: Collection,
  id: string
): { item: Item; parentId: ParentRef; index: number } | null {
  const walk = (items: Item[], parentId: ParentRef): ReturnType<typeof findItem> => {
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      if (item.id === id) return { item, parentId, index }
      if (item.kind === 'folder') {
        const hit = walk(item.items, item.id)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(c.items, null)
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length))
}

function spliceIn(items: Item[], item: Item, index: number | undefined): Item[] {
  const at = index === undefined ? items.length : clamp(index, items.length)
  return [...items.slice(0, at), item, ...items.slice(at)]
}

/** Rebuilds the path to the folder `id`, applying `fn` to its items. Returns null when not found. */
function mapFolderItems(items: Item[], id: string, fn: (xs: Item[]) => Item[]): Item[] | null {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    if (it.kind !== 'folder') continue
    if (it.id === id) {
      const next = [...items]
      next[i] = { ...it, items: fn(it.items) }
      return next
    }
    const inner = mapFolderItems(it.items, id, fn)
    if (inner) {
      const next = [...items]
      next[i] = { ...it, items: inner }
      return next
    }
  }
  return null
}

function withItems(c: Collection, items: Item[] | null): Collection {
  return items ? { ...c, items } : c
}

function editChildren(c: Collection, parentId: ParentRef, fn: (xs: Item[]) => Item[]): Collection {
  if (parentId === null) return { ...c, items: fn(c.items) }
  return withItems(c, mapFolderItems(c.items, parentId, fn))
}

export function insertItem(
  c: Collection,
  parentId: ParentRef,
  item: Item,
  index?: number
): Collection {
  return editChildren(c, parentId, (xs) => spliceIn(xs, item, index))
}

export function removeItem(c: Collection, id: string): Collection {
  const found = findItem(c, id)
  if (!found) return c
  return editChildren(c, found.parentId, (xs) => xs.filter((x) => x.id !== id))
}

export function updateItem(c: Collection, id: string, fn: (item: Item) => Item): Collection {
  const found = findItem(c, id)
  if (!found) return c
  return editChildren(c, found.parentId, (xs) => xs.map((x) => (x.id === id ? fn(x) : x)))
}

export function renameItem(c: Collection, id: string, name: string): Collection {
  const trimmed = name.trim()
  if (trimmed === '') return c
  return updateItem(c, id, (item) => ({ ...item, name: trimmed }))
}

export function moveItem(
  c: Collection,
  id: string,
  parentId: ParentRef,
  index: number
): Collection {
  const found = findItem(c, id)
  if (!found) return c
  if (parentId !== null) {
    const target = findItem(c, parentId)
    if (!target || target.item.kind !== 'folder') return c
    if (found.item.kind === 'folder') {
      if (parentId === id) return c
      if (findItem({ ...c, items: found.item.items }, parentId)) return c
    }
  }
  const removed = removeItem(c, id)
  return insertItem(removed, parentId, found.item, index)
}

function cloneWithNewIds(item: Item): Item {
  if (item.kind === 'folder') {
    return { ...item, id: crypto.randomUUID(), items: item.items.map(cloneWithNewIds) }
  }
  return {
    ...structuredClone(item),
    id: crypto.randomUUID()
  }
}

export function duplicateItem(
  c: Collection,
  id: string
): { collection: Collection; newId: string } | null {
  const found = findItem(c, id)
  if (!found) return null
  const copy = { ...cloneWithNewIds(found.item), name: `${found.item.name} copy` }
  return {
    collection: insertItem(c, found.parentId, copy, found.index + 1),
    newId: copy.id
  }
}

export function collectRequestIds(item: Item): string[] {
  if (item.kind === 'request') return [item.id]
  return item.items.flatMap(collectRequestIds)
}

export function listFolders(c: Collection): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = []
  const walk = (items: Item[], prefix: string): void => {
    for (const it of items) {
      if (it.kind !== 'folder') continue
      const path = prefix === '' ? it.name : `${prefix} / ${it.name}`
      out.push({ id: it.id, path })
      walk(it.items, path)
    }
  }
  walk(c.items, '')
  return out
}
