import { deepEqual } from '../../shared/equal'
import type { Collection } from '../../shared/types'
import type { WorkspaceState } from './workspace'

let memo: {
  stash: WorkspaceState['stash']
  draft: WorkspaceState['draft']
  saved: WorkspaceState['saved']
  active: WorkspaceState['active']
  out: ReadonlySet<string>
} | null = null

/** Request ids with unsaved edits. Returns the same Set while its inputs are the same references. */
export function selectDirtyIds(s: WorkspaceState): ReadonlySet<string> {
  const { stash, draft, saved, active } = s
  if (
    memo &&
    memo.stash === stash &&
    memo.draft === draft &&
    memo.saved === saved &&
    memo.active === active
  ) {
    return memo.out
  }
  const out = new Set(Object.keys(stash))
  if (active && !deepEqual(draft, saved)) out.add(active.requestId)
  memo = { stash, draft, saved, active, out }
  return out
}

export function selectActiveCollection(s: WorkspaceState): Collection | null {
  if (!s.active) return null
  const id = s.active.collectionId
  return s.collections.find((c) => c.id === id) ?? null
}
