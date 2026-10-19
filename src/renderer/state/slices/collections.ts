import { findItem, newCollection } from '../../../shared/collection-tree'
import type { Collection, RequestSpec } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import { afterInit, errorMessage, type SliceCtx } from './ctx'
import { createDocQueue } from './doc-queue'
import type { AddNotice } from './notices'

export { byName } from './doc-queue'

export function createCollections(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice
): {
  slice: Pick<
    WorkspaceState,
    'collections' | 'createCollection' | 'updateCollection' | 'deleteCollection'
  >
  /**
   * Drops/renames the active draft and stash entries whose request changed or vanished, drops
   * `recent` refs to vanished requests (and points moved ones at their new collection), and
   * clears `draftCollectionId` once its collection is gone.
   */
  reconcile(): void
  /** Saves a ready-made collection (e.g. an import) through the queue; afterInit-gated. */
  create(c: Collection): Promise<boolean>
} {
  const locateWithin = (
    cols: Collection[],
    requestId: string
  ): { collectionId: string; item: RequestSpec } | null => {
    for (const c of cols) {
      const hit = findItem(c, requestId)
      if (hit && hit.item.kind === 'request') return { collectionId: c.id, item: hit.item }
    }
    return null
  }
  const locate = (cols: Collection[], requestId: string): RequestSpec | null =>
    locateWithin(cols, requestId)?.item ?? null

  const reconcile = (): void => {
    const s = get()
    // Reconcile against what is confirmed on disk, not the optimistic view.
    const cols = s.collections.map((c) => queue.confirmed(c.id) ?? c)
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
    const recent = s.recent.flatMap((ref) => {
      const found = locateWithin(cols, ref.requestId)
      if (!found) return []
      return [
        found.collectionId === ref.collectionId ? ref : { ...ref, collectionId: found.collectionId }
      ]
    })
    if (recent.length !== s.recent.length || recent.some((r, i) => r !== s.recent[i])) {
      patch.recent = recent
    }
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
    if (s.draftCollectionId !== null && !cols.some((c) => c.id === s.draftCollectionId)) {
      patch.draftCollectionId = null // its collection was deleted
    }
    if (Object.keys(patch).length > 0) set(patch)
  }

  const queue = createDocQueue<Collection>({
    read: () => get().collections,
    write: (collections) => set({ collections }),
    save: (c) => api['collections:save'](c),
    remove: (id) => api['collections:delete']({ id }),
    onSaveError: (c, err, kind) =>
      addNotice(
        'danger',
        kind === 'create'
          ? `Couldn't create collection: ${errorMessage(err)}`
          : `Couldn't save "${c.name}": ${errorMessage(err)}`
      ),
    onDeleteError: (c, err) =>
      addNotice('danger', `Couldn't delete "${c.name}": ${errorMessage(err)}`),
    onConfirmed: reconcile
  })

  return {
    reconcile,
    create: afterInit(get, async (c: Collection) => queue.create(c)),
    slice: {
      collections: [],
      updateCollection: afterInit(
        get,
        async (collectionId: string, fn: (c: Collection) => Collection) =>
          queue.update(collectionId, fn)
      ),
      createCollection: afterInit(get, async (name: string) => {
        const c = newCollection(name.trim() || 'New collection')
        return (await queue.create(c)) ? c : null
      }),
      deleteCollection: afterInit(get, async (collectionId: string) => queue.delete(collectionId))
    }
  }
}
