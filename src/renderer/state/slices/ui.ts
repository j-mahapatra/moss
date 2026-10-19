import type { RequestSpec } from '../../../shared/types'
import type { RequestRef, WorkspaceState } from '../workspace'
import type { SliceCtx } from './ctx'

export type ConfirmDiscard =
  | null
  | { then: 'new' }
  | { then: 'open'; ref: RequestRef }
  | { then: 'history'; id: string }
  /** `notice` is raised once the imported request actually opens. */
  | { then: 'imported'; spec: RequestSpec; notice?: string }

export type UiState = {
  saveDialogOpen: boolean
  /** Collection id whose variables dialog is open. */
  variablesFor: string | null
  confirmDiscard: ConfirmDiscard
  /** Which panel the navigator column shows. */
  navigatorView: NavigatorView
  paletteOpen: boolean
  recentsOpen: boolean
}

export type NavigatorView = 'collections' | 'environments' | 'history' | 'import'

export function createUi({
  set,
  get
}: SliceCtx): Pick<
  WorkspaceState,
  | 'ui'
  | 'showPanel'
  | 'openSaveDialog'
  | 'openVariables'
  | 'setConfirmDiscard'
  | 'confirmDiscard'
  | 'setPaletteOpen'
  | 'setRecentsOpen'
> {
  const patch = (p: Partial<UiState>): void => set((s) => ({ ui: { ...s.ui, ...p } }))
  return {
    ui: {
      saveDialogOpen: false,
      variablesFor: null,
      confirmDiscard: null,
      navigatorView: 'collections',
      paletteOpen: false,
      recentsOpen: false
    },
    showPanel: (view) => {
      patch({ navigatorView: view })
      if (get().navigatorCollapsed) get().toggleNavigator()
    },
    openSaveDialog: (open) => patch({ saveDialogOpen: open }),
    openVariables: (id) => patch({ variablesFor: id }),
    setConfirmDiscard: (v) => patch({ confirmDiscard: v }),
    setPaletteOpen: (open) => patch({ paletteOpen: open }),
    setRecentsOpen: (open) => patch({ recentsOpen: open }),
    confirmDiscard: () => {
      const pending = get().ui.confirmDiscard
      if (!pending) return
      patch({ confirmDiscard: null })
      if (pending.then === 'new') get().newRequest({ discard: true })
      else if (pending.then === 'history') get().openHistoryEntry(pending.id, { discard: true })
      else if (pending.then === 'imported') {
        get().openImportedRequest(pending.spec, {
          discard: true,
          ...(pending.notice ? { notice: pending.notice } : {})
        })
      } else get().openRequest(pending.ref, { discard: true })
    }
  }
}
