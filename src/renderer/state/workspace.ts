import { createStore, type StoreApi } from 'zustand/vanilla'
import type { MossApi } from '../../shared/ipc-contract'
import type {
  Collection,
  Environment,
  HistoryEntry,
  RequestSpec,
  SendResult,
  ThemePref
} from '../../shared/types'
import { errorMessage } from './errors'
import type { SliceCtx } from './slices/ctx'
import { createCollections } from './slices/collections'
import { byName } from './slices/doc-queue'
import { createEnvironments } from './slices/environments'
import { createHistory } from './slices/history'
import { createImportExport, type ImportOutcome } from './slices/import-export'
import { createNotices } from './slices/notices'
import { createRequests, RECENT_MAX } from './slices/requests'
import { createUi, type ConfirmDiscard, type NavigatorView, type UiState } from './slices/ui'
import { createSettings, SPLIT_DEFAULT } from './slices/settings'

export { RECENT_MAX, SPLIT_DEFAULT }
export type { ConfirmDiscard, ImportOutcome }

export type RequestRef = { collectionId: string; requestId: string }
export type Notice = { id: string; tone: 'warning' | 'danger'; message: string }

export type WorkspaceApi = Pick<
  MossApi,
  | 'request:send'
  | 'request:cancel'
  | 'collections:list'
  | 'collections:save'
  | 'collections:delete'
  | 'environments:list'
  | 'environments:save'
  | 'environments:delete'
  | 'settings:get'
  | 'settings:set'
  | 'history:list'
  | 'history:delete'
  | 'history:clear'
  | 'import:open-file'
  | 'export:save-file'
>

export type WorkspaceState = {
  draft: RequestSpec
  inFlight: { requestId: string; startedAt: number } | null
  result: SendResult | null
  /** Request pane share of the split, 0.2 to 0.8. */
  split: number
  collections: Collection[]
  environments: Environment[]
  /** Selected environment; always the id of an entry in `environments`, or null. */
  activeEnvironmentId: string | null
  loaded: boolean
  notices: Notice[]
  /** Where `draft` lives; null = an unsaved new request. */
  active: RequestRef | null
  /** Last saved version of the active request. */
  saved: RequestSpec | null
  /** Edited drafts of non-active saved requests, by request id. */
  stash: Record<string, RequestSpec>
  /**
   * Saved requests most recently opened or saved, newest first: at most RECENT_MAX, no
   * duplicates, in memory only. Names are read from `collections` when shown.
   */
  recent: RequestRef[]
  /**
   * Scope and Save default for an unsaved draft reopened from history: the entry's collection
   * if it still exists. Null whenever `active` is set.
   */
  draftCollectionId: string | null
  /** Sent requests, newest first, at most HISTORY_CAP. */
  history: HistoryEntry[]
  navigatorCollapsed: boolean
  /** Theme preference; 'system' follows the OS. */
  theme: ThemePref
  ui: UiState

  updateDraft(patch: Partial<RequestSpec>): void
  send(): Promise<void>
  cancel(): void
  setSplit(r: number): void
  setTheme(pref: ThemePref): void
  init(): Promise<void>
  openRequest(ref: RequestRef, opts?: { discard?: boolean }): 'opened' | 'confirm-discard'
  newRequest(opts?: { discard?: boolean }): 'opened' | 'confirm-discard'
  /**
   * Opens a copy of a history entry's request as an unsaved draft; an unknown id is a no-op.
   * On 'confirm-discard' it sets `ui.confirmDiscard` itself.
   */
  openHistoryEntry(id: string, opts?: { discard?: boolean }): 'opened' | 'confirm-discard'
  /**
   * Opens a copy of an imported request (fresh id) as an unsaved draft, with the same leave
   * rules as openHistoryEntry. On 'confirm-discard' it sets `ui.confirmDiscard` itself;
   * `notice` is raised as a warning only once the request opens.
   */
  openImportedRequest(
    spec: RequestSpec,
    opts?: { discard?: boolean; notice?: string }
  ): 'opened' | 'confirm-discard'
  /** Imports pasted/opened text: a v2.1 collection is saved, a curl command is opened. */
  importText(text: string): Promise<ImportOutcome>
  /** Picks a file and imports it; null = the dialog was cancelled. */
  importFile(): Promise<ImportOutcome | null>
  /** Saves a collection as Postman v2.1 JSON; an unknown id is 'failed' without a notice. */
  exportCollection(id: string): Promise<'saved' | 'cancelled' | 'failed'>
  /** Replaces the draft's request parts (not id/name) from a curl command; false = parse error. */
  applyCurlToDraft(text: string): boolean
  /** Optimistic; resolves false (entry restored, notice shown) if the delete failed. */
  deleteHistoryEntry(id: string): Promise<boolean>
  /** Optimistic; resolves false (list restored, notice shown) if the clear failed. */
  clearHistory(): Promise<boolean>
  saveActive(): Promise<'saved' | 'failed' | 'needs-target'>
  saveAs(target: {
    collectionId: string
    folderId: string | null
    name: string
  }): Promise<'saved' | 'failed' | 'gone'>
  createCollection(name: string): Promise<Collection | null>
  updateCollection(collectionId: string, fn: (c: Collection) => Collection): Promise<boolean>
  /** Resolves true once deleted; false if missing, already being deleted, or the delete failed. */
  deleteCollection(collectionId: string): Promise<boolean>
  createEnvironment(name: string): Promise<Environment | null>
  /** Saves a copy named `<name> copy`; null if the source is gone or the save failed. */
  duplicateEnvironmentById(id: string): Promise<Environment | null>
  updateEnvironment(id: string, fn: (e: Environment) => Environment): Promise<boolean>
  deleteEnvironment(id: string): Promise<boolean>
  /** Updates state at once and schedules a settings save; an unknown id is a no-op. */
  setActiveEnvironment(id: string | null): void
  /** Saves pending settings now (used on unload); resolves when the in-flight save settles. */
  flushSettings(): Promise<void>
  dismissNotice(id: string): void
  /** Raises a danger notice. */
  reportError(message: string): void
  toggleNavigator(): void
  /** Shows a navigator panel and expands the column if it was collapsed. */
  showPanel(view: NavigatorView): void
  openSaveDialog(open: boolean): void
  openVariables(collectionId: string | null): void
  setConfirmDiscard(v: ConfirmDiscard): void
  /** Opens or closes the command palette. */
  setPaletteOpen(open: boolean): void
  /** Opens or closes the ⌃Tab recent-requests switcher. */
  setRecentsOpen(open: boolean): void
  /** Re-runs the pending new/open/history/imported open with discard, then clears the confirmation. */
  confirmDiscard(): void
}

export function createWorkspaceStore(api: WorkspaceApi): StoreApi<WorkspaceState> {
  return createStore<WorkspaceState>()((set, get) => {
    const ctx: SliceCtx = { set, get, api }
    const notices = createNotices(ctx)
    const settings = createSettings(ctx, notices.addNotice)
    const collections = createCollections(ctx, notices.addNotice)
    const history = createHistory(ctx, notices.addNotice)

    let initPromise: Promise<void> | null = null
    const init = (): Promise<void> => {
      initPromise ??= (async () => {
        settings.beginLoad()
        const [cols, envs, sets, hist] = await Promise.allSettled([
          Promise.resolve().then(() => api['collections:list']()),
          Promise.resolve().then(() => api['environments:list']()),
          Promise.resolve().then(() => api['settings:get']()),
          Promise.resolve().then(() => api['history:list']())
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
        if (envs.status === 'fulfilled') {
          set({ environments: [...envs.value.environments].sort(byName) })
          for (const w of envs.value.warnings) notices.addNotice('warning', w)
        } else {
          notices.addNotice(
            'danger',
            `Couldn't load your environments: ${errorMessage(envs.reason)}`
          )
        }
        // After environments: an active id that no longer exists is dropped here.
        if (sets.status === 'fulfilled') {
          settings.applySettings(sets.value.settings, envs.status === 'fulfilled')
          for (const w of sets.value.warnings) notices.addNotice('warning', w)
        } else {
          settings.applySettings(null, envs.status === 'fulfilled')
          notices.addNotice('danger', `Couldn't load settings: ${errorMessage(sets.reason)}`)
        }
        if (hist.status === 'fulfilled') {
          history.applyLoaded([...hist.value.entries])
          for (const w of hist.value.warnings) notices.addNotice('warning', w)
        } else {
          notices.addNotice('danger', `Couldn't load history: ${errorMessage(hist.reason)}`)
        }
        set({ loaded: true })
      })()
      return initPromise
    }

    return {
      ...createRequests(ctx, history.prepend, notices.addNotice),
      ...history.slice,
      ...collections.slice,
      ...createImportExport(ctx, notices.addNotice, collections.create),
      ...createEnvironments(ctx, notices.addNotice),
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
