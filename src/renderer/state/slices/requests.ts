import { findItem, insertItem, toItem, toSpec, updateItem } from '../../../shared/collection-tree'
import { deepEqual } from '../../../shared/equal'
import { newRequestSpec, type HistoryEntry, type RequestSpec } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import { afterInit, type SliceCtx } from './ctx'
import type { AddNotice } from './notices'

type RequestsSlice = Pick<
  WorkspaceState,
  | 'draft'
  | 'inFlight'
  | 'result'
  | 'active'
  | 'saved'
  | 'stash'
  | 'draftCollectionId'
  | 'updateDraft'
  | 'send'
  | 'cancel'
  | 'openRequest'
  | 'newRequest'
  | 'saveActive'
  | 'saveAs'
  | 'openHistoryEntry'
  | 'openImportedRequest'
>

export function createRequests(
  { set, get, api }: SliceCtx,
  /** Records a sent request's history entry. */
  recordHistory: (entry: HistoryEntry) => void,
  addNotice: AddNotice
): RequestsSlice {
  const isBlank = (d: RequestSpec): boolean =>
    deepEqual({ ...d, id: '' }, { ...newRequestSpec(), id: '' })
  /** The draft as a history entry opened it; leaving it unedited needs no confirmation. */
  let reopened: RequestSpec | null = null

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
    const pristine = isBlank(draft) || (reopened !== null && deepEqual(draft, reopened))
    if (!active && !discard && !pristine) return false
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
    draftCollectionId: null,

    updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
    cancel,

    send: async () => {
      cancel()
      const requestId = crypto.randomUUID()
      set({ inFlight: { requestId, startedAt: Date.now() } })
      const isCurrent = (): boolean => get().inFlight?.requestId === requestId
      const collectionId = get().active?.collectionId ?? get().draftCollectionId
      // Read from state, not saved settings: a switch made ms ago counts (RF2).
      const environmentId = get().activeEnvironmentId ?? undefined
      try {
        const { result, history } = await api['request:send']({
          requestId,
          request: get().draft,
          ...(collectionId ? { collectionId } : {}),
          ...(environmentId ? { environmentId } : {})
        })
        // Recorded even when stale: the request really was sent.
        if (history) recordHistory(history)
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
      reopened = null
      set((s) => {
        const { [ref.requestId]: stashed, ...rest } = s.stash
        // Invariant: the stash never contains the active request.
        return {
          draft: stashed ?? spec,
          saved: spec,
          active: ref,
          stash: rest,
          draftCollectionId: null
        }
      })
      return 'opened'
    },

    newRequest: (opts) => {
      if (!leaveDraft(opts?.discard)) return 'confirm-discard'
      reopened = null
      set({ draft: newRequestSpec(), active: null, saved: null, draftCollectionId: null })
      return 'opened'
    },

    openHistoryEntry: (id, opts) => {
      const entry = get().history.find((e) => e.id === id)
      if (!entry) return 'opened'
      if (!leaveDraft(opts?.discard)) return 'confirm-discard'
      const draft: RequestSpec = { ...structuredClone(entry.request), id: crypto.randomUUID() }
      const cid = entry.collectionId
      reopened = draft
      if (entry.bodyTruncated)
        addNotice('warning', "This request's body was too large to keep in full; it was shortened.")
      set({
        draft,
        active: null,
        saved: null,
        draftCollectionId: cid && get().collections.some((c) => c.id === cid) ? cid : null
      })
      return 'opened'
    },

    openImportedRequest: (spec, opts) => {
      if (!leaveDraft(opts?.discard)) {
        set((s) => ({
          ui: {
            ...s.ui,
            confirmDiscard: {
              then: 'imported',
              spec,
              ...(opts?.notice ? { notice: opts.notice } : {})
            }
          }
        }))
        return 'confirm-discard'
      }
      const draft: RequestSpec = { ...structuredClone(spec), id: crypto.randomUUID() }
      reopened = draft
      set({ draft, active: null, saved: null, draftCollectionId: null })
      if (opts?.notice) addNotice('warning', opts.notice)
      return 'opened'
    },

    saveActive: async () => {
      const { active, draft } = get()
      if (!active) return 'needs-target'
      const ok = await get().updateCollection(active.collectionId, (c) =>
        updateItem(c, active.requestId, (it) => ({ ...toItem(draft), name: it.name }))
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

    saveAs: afterInit(
      get,
      async (
        target: Parameters<WorkspaceState['saveAs']>[0]
      ): ReturnType<WorkspaceState['saveAs']> => {
        const { draft } = get()
        const idTaken = get().collections.some((c) => findItem(c, draft.id) !== null)
        const spec: RequestSpec = {
          ...draft,
          id: idTaken ? crypto.randomUUID() : draft.id,
          name: target.name.trim() || 'Untitled request'
        }
        if (!get().collections.some((c) => c.id === target.collectionId)) return 'gone'
        const ok = await get().updateCollection(target.collectionId, (c) =>
          insertItem(c, target.folderId, toItem(spec))
        )
        // A failed save raised a notice; a missing collection/folder raised none.
        if (!ok) return 'failed'
        const tc = get().collections.find((c) => c.id === target.collectionId)
        if (!tc || !findItem(tc, spec.id)) return 'gone'
        // Only retarget the view if the user is still on the draft that was saved.
        if (get().draft.id !== draft.id) return 'saved'
        reopened = null
        set({
          draftCollectionId: null,
          // keep edits typed while the save was pending
          draft: { ...get().draft, id: spec.id, name: spec.name },
          saved: spec,
          active: { collectionId: target.collectionId, requestId: spec.id }
        })
        return 'saved'
      }
    )
  }
}
