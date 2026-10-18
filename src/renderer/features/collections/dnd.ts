import { findItem, type ParentRef } from '../../../shared/collection-tree'
import type { Collection } from '../../../shared/types'

export type DropPosition = 'before' | 'after' | 'inside'

/** Custom data-transfer type carrying `{ collectionId, itemId }`. */
export const DRAG_TYPE = 'application/x-moss-item'

export type DragPayload = { collectionId: string; itemId: string }

export function parsePayload(raw: string): DragPayload | null {
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { collectionId, itemId } = v as Record<string, unknown>
    if (typeof collectionId !== 'string' || typeof itemId !== 'string') return null
    return { collectionId, itemId }
  } catch {
    return null
  }
}

/** Folders: top 25% before, bottom 25% after, middle inside. Requests: halves. */
export function dropPositionFor(offsetY: number, height: number, isFolder: boolean): DropPosition {
  const ratio = height > 0 ? offsetY / height : 0
  if (isFolder) {
    if (ratio < 0.25) return 'before'
    if (ratio >= 0.75) return 'after'
    return 'inside'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

/**
 * Resolves a drop to a `moveItem` destination (after-removal index semantics).
 * `targetId` may be the collection's own id: only `inside` is meaningful there
 * (append to the collection root). Returns null for invalid drops and for drops
 * that would leave the item where it already is.
 */
export function resolveDrop(
  c: Collection,
  draggedId: string,
  targetId: string,
  pos: DropPosition
): { parentId: ParentRef; index: number } | null {
  const dragged = findItem(c, draggedId)
  if (!dragged || targetId === draggedId) return null

  let dest: { parentId: ParentRef; index: number }
  if (targetId === c.id) {
    if (pos !== 'inside') return null
    const len = c.items.length
    dest = { parentId: null, index: dragged.parentId === null ? len - 1 : len }
  } else {
    const target = findItem(c, targetId)
    if (!target) return null
    if (dragged.item.kind === 'folder' && findItem({ ...c, items: dragged.item.items }, targetId)) {
      return null
    }
    if (pos === 'inside') {
      if (target.item.kind !== 'folder') return null
      const len = target.item.items.length
      dest = {
        parentId: target.item.id,
        index: dragged.parentId === target.item.id ? len - 1 : len
      }
    } else {
      let index = target.index + (pos === 'after' ? 1 : 0)
      if (dragged.parentId === target.parentId && dragged.index < target.index) index -= 1
      dest = { parentId: target.parentId, index }
    }
  }
  if (dest.parentId === dragged.parentId && dest.index === dragged.index) return null
  return dest
}
