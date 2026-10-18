import { createStore, type StoreApi } from 'zustand/vanilla'
import type { MossApi } from '../../shared/ipc-contract'
import type { Collection, RequestSpec, SendResult } from '../../shared/types'
import { errorMessage, type SliceCtx } from './slices/ctx'
import { createCollections } from './slices/collections'
import { createNotices } from './slices/notices'
import { createRequests } from './slices/requests'
import { createUi, type ConfirmDiscard, type UiState } from './slices/ui'
import { createSettings, SPLIT_DEFAULT } from './slices/settings'

export { SPLIT_DEFAULT }
export type { ConfirmDiscard }

export type RequestRef = { collectionId: string; requestId: string }
export type Notice = { id: string; tone: 'warning' | 'danger'; message: string }

export type WorkspaceApi = Pick<
  MossApi,
  | 'request:send'
  | 'request:cancel'
  | 'collections:list'
  | 'collections:save'
  | 'collections:delete'
  | 'settings:get'
  | 'settings:set'
>

export type WorkspaceState = {
  draft: RequestSpec
  inFlight: { requestId: string; startedAt: number } | null
  result: SendResult | null
  /** Request pane share of the split, 0.2 to 0.8. */
  split: number
  collections: Collection[]
  loaded: boolean
  notices: Notice[]
  /** Where `draft` lives; null = an unsaved new request. */
  active: RequestRef | null
  /** Last saved version of the active request. */
  saved: RequestSpec | null
  /** Edited drafts of non-active saved requests, by request id. */
  stash: Record<string, RequestSpec>
  navigatorCollapsed: boolean
  ui: UiState

  updateDraft(patch: Partial<RequestSpec>): void
  send(): Promise<void>
  cancel(): void
  setSplit(r: number): void
  init(): Promise<void>
  openRequest(ref: RequestRef, opts?: { discard?: boolean }): 'opened' | 'confirm-discard'
  newRequest(opts?: { discard?: boolean }): 'opened' | 'confirm-discard'
  saveActive(): Promise<'saved' | 'failed' | 'needs-target'>
  saveAs(target: { collectionId: string; folderId: string | null; name: string }): Promise<boolean>
  createCollection(name: string): Promise<Collection | null>
  updateCollection(collectionId: string, fn: (c: Collection) => Collection): Promise<boolean>
  deleteCollection(collectionId: string): Promise<void>
  dismissNotice(id: string): void
  toggleNavigator(): void
  openSaveDialog(open: boolean): void
  openVariables(collectionId: string | null): void
  setConfirmDiscard(v: ConfirmDiscard): void
  /** Re-runs the pending new/open with discard, then clears the confirmation. */
  confirmDiscard(): void
}

export function createWorkspaceStore(api: WorkspaceApi): StoreApi<WorkspaceState> {
  return createStore<WorkspaceState>()((set, get) => {
    const ctx: SliceCtx = { set, get, api }
    const notices = createNotices(ctx)
    const settings = createSettings(ctx, notices.addNotice)
    const collections = createCollections(ctx, notices.addNotice)

    let initPromise: Promise<void> | null = null
    const init = (): Promise<void> => {
      initPromise ??= (async () => {
        const [cols, sets] = await Promise.allSettled([
          Promise.resolve().then(() => api['collections:list']()),
          Promise.resolve().then(() => api['settings:get']())
        ])
        if (cols.status === 'fulfilled') {
          set({ collections: [...cols.value.collections] })
          for (const w of cols.value.warnings) notices.addNotice('warning', w)
        } else {
          notices.addNotice(
            'danger',
            `Couldn't load your collections: ${errorMessage(cols.reason)}`
          )
        }
        if (sets.status === 'fulfilled') {
          settings.applySettings(sets.value.settings)
          for (const w of sets.value.warnings) notices.addNotice('warning', w)
        } else {
          notices.addNotice('danger', `Couldn't load settings: ${errorMessage(sets.reason)}`)
        }
        set({ loaded: true })
      })()
      return initPromise
    }

    return {
      ...createRequests(ctx),
      ...collections.slice,
      ...settings.slice,
      ...notices.slice,
      ...createUi(ctx),
      loaded: false,
      init
    }
  })
}

export { WorkspaceProvider } from './workspace-context'
export { useWorkspace } from './workspace-hooks'
