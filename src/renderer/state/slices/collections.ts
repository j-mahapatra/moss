import { findItem } from '../../../shared/collection-tree'
import type { Collection, RequestSpec } from '../../../shared/types'
import { newCollection } from '../../../shared/collection-tree'
import type { WorkspaceState } from '../workspace'
import { errorMessage, type SliceCtx } from './ctx'
import type { AddNotice } from './notices'

export const byName = (a: Collection, b: Collection): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)

/**
 * Per-collection save queue. `confirmed` is the last version known to be on disk;
 * `pending` are the update functions applied optimistically but not yet saved.
 * Saves for one collection run strictly one after another (`tail`). Each save writes
 * confirmed + pending[0..this op]. If it fails, that op is dropped and the visible
 * collection is recomputed as confirmed + the remaining pending ops, so only the
 * failed change rolls back.
 *
 * `fn` runs exactly once per update (against the optimistic state, when enqueued) and that
 * result is what gets saved, so ids it generates match between state and disk. Only after
 * an earlier op has failed are the later ops re-folded over the confirmed state, so `fn`
 * may then run again.
 */
type Op = { fn: (c: Collection) => Collection; result: Collection }
type Entry = { confirmed: Collection; pending: Op[]; tail: Promise<unknown> }

/** Recomputes each pending op's result over `base`, in order (only used after a failure). */
function refold(base: Collection, pending: Op[]): Collection {
  let cur = base
  for (const op of pending) {
    op.result = op.fn(cur)
    cur = op.result
  }
  return cur
}

export function createCollections(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice
): {
  slice: Pick<
    WorkspaceState,
    'collections' | 'createCollection' | 'updateCollection' | 'deleteCollection'
  >
  /** Drops/renames the active draft and stash entries whose request changed or vanished. */
  reconcile(): void
} {
  const entries = new Map<string, Entry>()

  const putCollection = (c: Collection): void =>
    set((s) => ({
      collections: [...s.collections.filter((x) => x.id !== c.id), c].sort(byName)
    }))

  const locate = (cols: Collection[], requestId: string): RequestSpec | null => {
    for (const c of cols) {
      const hit = findItem(c, requestId)
      if (hit && hit.item.kind === 'request') return hit.item
    }
    return null
  }

  const reconcile = (): void => {
    const s = get()
    // Reconcile against what is confirmed on disk, not the optimistic view.
    const cols = s.collections.map((c) => entries.get(c.id)?.confirmed ?? c)
    const patch: Partial<WorkspaceState> = {}
    const stash = { ...s.stash }
    let stashChanged = false
    for (const [id, spec] of Object.entries(s.stash)) {
      const item = locate(cols, id)
      if (!item) {
        delete stash[id]
        stashChanged = true
      } else if (item.name !== spec.name) {
        stash[id] = { ...spec, name: item.name }
        stashChanged = true
      }
    }
    if (stashChanged) patch.stash = stash
    if (s.active) {
      const c = cols.find((x) => x.id === s.active!.collectionId)
      const hit = c ? findItem(c, s.active.requestId) : null
      if (!hit || hit.item.kind !== 'request') {
        patch.active = null
        patch.saved = null // draft is kept as an unsaved request
      } else if (s.saved && hit.item.name !== s.saved.name) {
        patch.draft = { ...s.draft, name: hit.item.name }
        patch.saved = { ...s.saved, name: hit.item.name }
      }
    }
    if (Object.keys(patch).length > 0) set(patch)
  }

  const updateCollection: WorkspaceState['updateCollection'] = async (collectionId, fn) => {
    const current = get().collections.find((c) => c.id === collectionId)
    if (!current) return false
    const next = fn(current)
    if (next === current) return true

    let entry = entries.get(collectionId)
    if (!entry) {
      entry = { confirmed: current, pending: [], tail: Promise.resolve() }
      entries.set(collectionId, entry)
    } else if (entry.pending.length === 0) {
      entry.confirmed = current
    }
    const e = entry
    const op: Op = { fn, result: next }
    e.pending.push(op)
    putCollection(next)

    const run = async (): Promise<boolean> => {
      // pending[0] is always this op: ops run FIFO.
      const toSave = op.result
      try {
        await api['collections:save'](toSave)
      } catch (err) {
        e.pending.shift()
        putCollection(refold(e.confirmed, e.pending))
        reconcile()
        addNotice('danger', `Couldn't save "${current.name}": ${errorMessage(err)}`)
        return false
      }
      e.confirmed = toSave
      e.pending.shift()
      reconcile()
      return true
    }
    const result = e.tail.then(run)
    e.tail = result
    return result
  }

  return {
    reconcile,
    slice: {
      collections: [],
      updateCollection,

      createCollection: async (name) => {
        const c = newCollection(name.trim() || 'New collection')
        try {
          await api['collections:save'](c)
        } catch (err) {
          addNotice('danger', `Couldn't create collection: ${errorMessage(err)}`)
          return null
        }
        putCollection(c)
        return c
      },

      deleteCollection: async (collectionId) => {
        const target = get().collections.find((c) => c.id === collectionId)
        if (!target) return
        await entries.get(collectionId)?.tail // let in-flight saves land first
        try {
          await api['collections:delete']({ id: collectionId })
        } catch (err) {
          addNotice('danger', `Couldn't delete "${target.name}": ${errorMessage(err)}`)
          return
        }
        entries.delete(collectionId)
        set((s) => ({ collections: s.collections.filter((c) => c.id !== collectionId) }))
        reconcile()
      }
    }
  }
}
