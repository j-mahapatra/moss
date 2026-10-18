import type { RequestRef, WorkspaceState } from '../workspace'
import type { SliceCtx } from './ctx'

export type ConfirmDiscard = null | { then: 'new' } | { then: 'open'; ref: RequestRef }

export type UiState = {
  saveDialogOpen: boolean
  /** Collection id whose variables dialog is open. */
  variablesFor: string | null
  confirmDiscard: ConfirmDiscard
}

export function createUi({
  set,
  get
}: SliceCtx): Pick<
  WorkspaceState,
  'ui' | 'openSaveDialog' | 'openVariables' | 'setConfirmDiscard' | 'confirmDiscard'
> {
  const patch = (p: Partial<UiState>): void => set((s) => ({ ui: { ...s.ui, ...p } }))
  return {
    ui: { saveDialogOpen: false, variablesFor: null, confirmDiscard: null },
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
