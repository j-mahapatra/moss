import type { RequestRef, WorkspaceState } from '../workspace'
import type { SliceCtx } from './ctx'

export type ConfirmDiscard = null | { then: 'new' } | { then: 'open'; ref: RequestRef }

export type UiState = {
  saveDialogOpen: boolean
  /** Collection id whose variables dialog is open. */
  variablesFor: string | null
  confirmDiscard: ConfirmDiscard
  /** Which panel the navigator column shows. */
  navigatorView: NavigatorView
}

export type NavigatorView = 'collections' | 'environments'

export function createUi({
  set,
  get
}: SliceCtx): Pick<
  WorkspaceState,
  'ui' | 'showPanel' | 'openSaveDialog' | 'openVariables' | 'setConfirmDiscard' | 'confirmDiscard'
> {
  const patch = (p: Partial<UiState>): void => set((s) => ({ ui: { ...s.ui, ...p } }))
  return {
    ui: {
      saveDialogOpen: false,
      variablesFor: null,
      confirmDiscard: null,
      navigatorView: 'collections'
    },
    showPanel: (view) => {
      patch({ navigatorView: view })
      if (get().navigatorCollapsed) get().toggleNavigator()
    },
    openSaveDialog: (open) => patch({ saveDialogOpen: open }),
    openVariables: (id) => patch({ variablesFor: id }),
    setConfirmDiscard: (v) => patch({ confirmDiscard: v }),
    confirmDiscard: () => {
      const pending = get().ui.confirmDiscard
      if (!pending) return
      patch({ confirmDiscard: null })
      if (pending.then === 'new') get().newRequest({ discard: true })
      else get().openRequest(pending.ref, { discard: true })
    }
  }
}
