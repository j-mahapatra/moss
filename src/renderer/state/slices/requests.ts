import { findItem, insertItem, toItem, toSpec, updateItem } from '../../../shared/collection-tree'
import { deepEqual } from '../../../shared/equal'
import { newRequestSpec, type RequestSpec } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import type { SliceCtx } from './ctx'

type RequestsSlice = Pick<
  WorkspaceState,
  | 'draft'
  | 'inFlight'
  | 'result'
  | 'active'
  | 'saved'
  | 'stash'
  | 'updateDraft'
  | 'send'
  | 'cancel'
  | 'openRequest'
  | 'newRequest'
  | 'saveActive'
  | 'saveAs'
>

export function createRequests({ set, get, api }: SliceCtx): RequestsSlice {
  const isBlank = (d: RequestSpec): boolean =>
    deepEqual({ ...d, id: '' }, { ...newRequestSpec(), id: '' })

  const cancel = (): void => {
    const { inFlight } = get()
    if (!inFlight) return
    void Promise.resolve(api['request:cancel']({ requestId: inFlight.requestId })).catch(
      () => undefined
    )
  }

  /** Stashes/clears the current draft and drops any in-flight request. False = needs confirmation. */
  const leaveDraft = (discard: boolean | undefined): boolean => {
    const { active, draft, saved, stash } = get()
    if (!active && !discard && !isBlank(draft)) return false
    const next = { ...stash }
    if (active) {
      if (saved && deepEqual(draft, saved)) delete next[active.requestId]
      else next[active.requestId] = draft
    }
    cancel()
    // Clearing inFlight makes send()'s isCurrent guard drop the old request's late result.
    set({ stash: next, inFlight: null, result: null })
    return true
  }

  return {
    draft: newRequestSpec(),
    inFlight: null,
    result: null,
    active: null,
    saved: null,
    stash: {},

    updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
    cancel,

    send: async () => {
      cancel()
      const requestId = crypto.randomUUID()
      set({ inFlight: { requestId, startedAt: Date.now() } })
      const isCurrent = (): boolean => get().inFlight?.requestId === requestId
      const collectionId = get().active?.collectionId
      try {
        const result = await api['request:send']({
          requestId,
          request: get().draft,
          ...(collectionId ? { collectionId } : {})
        })
        if (isCurrent()) set({ result, inFlight: null })
      } catch (err) {
        if (isCurrent()) {
          const message = err instanceof Error ? err.message : String(err)
          set({
            result: {
              ok: false,
              error: { kind: 'unknown', message: `Request failed: ${message}` }
            },
            inFlight: null
          })
        }
      }
    },

    openRequest: (ref, opts) => {
      const cur = get().active
      // Already open: leave the draft, the in-flight send and the response alone.
      if (cur && cur.collectionId === ref.collectionId && cur.requestId === ref.requestId) {
        return 'opened'
      }
      const c = get().collections.find((x) => x.id === ref.collectionId)
      const hit = c ? findItem(c, ref.requestId) : null
      if (!hit || hit.item.kind !== 'request') return 'opened'
      if (!leaveDraft(opts?.discard)) return 'confirm-discard'
      const spec = toSpec(hit.item)
      set((s) => {
        const { [ref.requestId]: stashed, ...rest } = s.stash
        // Invariant: the stash never contains the active request.
        return { draft: stashed ?? spec, saved: spec, active: ref, stash: rest }
      })
      return 'opened'
    },

    newRequest: (opts) => {
      if (!leaveDraft(opts?.discard)) return 'confirm-discard'
      set({ draft: newRequestSpec(), active: null, saved: null })
      return 'opened'
    },

    saveActive: async () => {
      const { active, draft } = get()
      if (!active) return 'needs-target'
      const ok = await get().updateCollection(active.collectionId, (c) =>
        updateItem(c, active.requestId, () => toItem(draft))
      )
      if (!ok) return 'failed'
      const cur = get()
      if (cur.active?.requestId === active.requestId) {
        set({ saved: draft })
      } else if (deepEqual(cur.stash[active.requestId], draft)) {
        const rest = { ...cur.stash }
        delete rest[active.requestId]
        set({ stash: rest })
      }
      return 'saved'
    },

    saveAs: async (target) => {
      const { draft } = get()
      const idTaken = get().collections.some((c) => findItem(c, draft.id) !== null)
      const spec: RequestSpec = {
        ...draft,
        id: idTaken ? crypto.randomUUID() : draft.id,
        name: target.name.trim() || 'Untitled request'
      }
      const ok = await get().updateCollection(target.collectionId, (c) =>
        insertItem(c, target.folderId, toItem(spec))
      )
      const tc = get().collections.find((c) => c.id === target.collectionId)
      if (!ok || !tc || !findItem(tc, spec.id)) return false
      // Only retarget the view if the user is still on the draft that was saved.
      if (get().draft.id !== draft.id) return true
      set({
        // keep edits typed while the save was pending
        draft: { ...get().draft, id: spec.id, name: spec.name },
        saved: spec,
        active: { collectionId: target.collectionId, requestId: spec.id }
      })
      return true
    }
  }
}
