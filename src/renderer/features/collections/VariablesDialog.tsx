import { useEffect } from 'react'
import type { KeyValue } from '../../../shared/types'
import { KeyValueDialog } from '../../ui'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'

const NO_ROWS: KeyValue[] = []

export function VariablesDialog(): React.JSX.Element {
  const store = useWorkspaceStore()
  const id = useWorkspace((s) => s.ui.variablesFor)
  const collection = useWorkspace((s) =>
    s.ui.variablesFor === null
      ? null
      : (s.collections.find((c) => c.id === s.ui.variablesFor) ?? null)
  )
  // Close if the collection disappears while open.
  const missing = id !== null && collection === null
  useEffect(() => {
    if (missing) store.getState().openVariables(null)
  }, [missing, store])

  return (
    <KeyValueDialog
      title={`Variables · ${collection?.name ?? ''}`}
      open={id !== null && collection !== null}
      rows={collection?.variables ?? NO_ROWS}
      keyPlaceholder="Key"
      onOpenChange={(o) => {
        if (!o) store.getState().openVariables(null)
      }}
      onSave={(rows) =>
        id === null
          ? Promise.resolve(false)
          : store.getState().updateCollection(id, (c) => ({ ...c, variables: rows }))
      }
    />
  )
}
