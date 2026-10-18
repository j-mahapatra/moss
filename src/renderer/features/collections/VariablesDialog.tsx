import { useEffect, useState } from 'react'
import type { KeyValue } from '../../../shared/types'
import { Button, Dialog, KeyValueGrid } from '../../ui'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'

export function VariablesDialog(): React.JSX.Element {
  const store = useWorkspaceStore()
  const id = useWorkspace((s) => s.ui.variablesFor)
  const name = useWorkspace((s) =>
    s.ui.variablesFor === null
      ? null
      : (s.collections.find((c) => c.id === s.ui.variablesFor)?.name ?? null)
  )
  // Close if the collection disappears while open.
  const missing = id !== null && name === null
  useEffect(() => {
    if (missing) store.getState().openVariables(null)
  }, [missing, store])

  return (
    <Dialog
      open={id !== null && name !== null}
      onOpenChange={(o) => {
        if (!o) store.getState().openVariables(null)
      }}
      title={`Variables · ${name ?? ''}`}
    >
      {/* Content unmounts on close, so the local copy is taken fresh on every open. */}
      {id !== null && <VariablesForm id={id} />}
    </Dialog>
  )
}

function VariablesForm({ id }: { id: string }): React.JSX.Element {
  const store = useWorkspaceStore()
  const [rows, setRows] = useState<KeyValue[]>(
    () =>
      store
        .getState()
        .collections.find((c) => c.id === id)
        ?.variables.map((v) => ({ ...v })) ?? []
  )
  const [saving, setSaving] = useState(false)
  const close = (): void => store.getState().openVariables(null)

  const save = async (): Promise<void> => {
    setSaving(true)
    let ok: boolean
    try {
      ok = await store.getState().updateCollection(id, (c) => ({ ...c, variables: rows }))
    } finally {
      setSaving(false)
    }
    if (ok) close()
  }

  return (
    <>
      <KeyValueGrid rows={rows} onChange={setRows} />
      <div className="moss-dialog__footer">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </>
  )
}
