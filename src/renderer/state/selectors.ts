import { deepEqual } from '../../shared/equal'
import type { Collection, Environment, KeyValue } from '../../shared/types'
import { buildScope, type VariableScope } from '../../shared/variables'
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

export function selectActiveEnvironment(s: WorkspaceState): Environment | null {
  const id = s.activeEnvironmentId
  if (id === null) return null
  return s.environments.find((e) => e.id === id) ?? null
}

let scopeMemo: {
  env: KeyValue[] | undefined
  col: KeyValue[] | undefined
  out: VariableScope
} | null = null

/**
 * The variables a send resolves against: the active environment over the active request's
 * collection. Returns the same Map while both variable arrays are the same references.
 */
export function selectScope(s: WorkspaceState): VariableScope {
  const env = selectActiveEnvironment(s)?.variables
  const col = selectActiveCollection(s)?.variables
  if (scopeMemo && scopeMemo.env === env && scopeMemo.col === col) return scopeMemo.out
  const out = buildScope(env ?? [], col ?? [])
  scopeMemo = { env, col, out }
  return out
}
