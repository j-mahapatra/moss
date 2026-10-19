import { findItem } from '../../shared/collection-tree'
import { deepEqual } from '../../shared/equal'
import type { Collection, Environment, HttpMethod, KeyValue } from '../../shared/types'
import { buildScope, type VariableScope } from '../../shared/variables'
import type { RequestRef, WorkspaceState } from './workspace'

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

/**
 * The collection the draft belongs to: the active request's, else (for an unsaved draft
 * reopened from history) `draftCollectionId`'s. Scope, Save default and send all use it.
 */
export function selectActiveCollection(s: WorkspaceState): Collection | null {
  const id = s.active?.collectionId ?? s.draftCollectionId
  if (id === null) return null
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
 * The variables a send resolves against: the active environment over the draft's collection
 * (see selectActiveCollection). Returns the same Map while both variable arrays are the same references.
 */
export function selectScope(s: WorkspaceState): VariableScope {
  const env = selectActiveEnvironment(s)?.variables
  const col = selectActiveCollection(s)?.variables
  if (scopeMemo && scopeMemo.env === env && scopeMemo.col === col) return scopeMemo.out
  const out = buildScope(env ?? [], col ?? [])
  scopeMemo = { env, col, out }
  return out
}

/** A `recent` ref resolved against the collections, for display. */
export type RecentEntry = {
  ref: RequestRef
  name: string
  method: HttpMethod
  collectionName: string
}

let recentMemo: {
  recent: WorkspaceState['recent']
  collections: WorkspaceState['collections']
  active: WorkspaceState['active']
  out: RecentEntry[]
} | null = null

/**
 * `recent` with live names, the current request first; refs that no longer resolve are left
 * out. Returns the same array while its inputs are the same references.
 */
export function selectRecentEntries(s: WorkspaceState): RecentEntry[] {
  const { recent, collections, active } = s
  if (
    recentMemo &&
    recentMemo.recent === recent &&
    recentMemo.collections === collections &&
    recentMemo.active === active
  ) {
    return recentMemo.out
  }
  const out: RecentEntry[] = []
  for (const ref of recent) {
    const c = collections.find((x) => x.id === ref.collectionId)
    const hit = c ? findItem(c, ref.requestId) : null
    if (!c || !hit || hit.item.kind !== 'request') continue
    const entry = { ref, name: hit.item.name, method: hit.item.method, collectionName: c.name }
    if (active && active.requestId === ref.requestId) out.unshift(entry)
    else out.push(entry)
  }
  recentMemo = { recent, collections, active, out }
  return out
}
