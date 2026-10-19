import { useEffect, useState } from 'react'
import type { KeyValue } from '../../../shared/types'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import { Button, Dialog, KeyValueGrid } from '../../ui'

type Props = {
  /** Id of the environment being edited, or null when closed. */
  envId: string | null
  onClose(): void
}

export function EnvironmentDialog({ envId, onClose }: Props): React.JSX.Element {
  const name = useWorkspace((s) =>
    envId === null ? null : (s.environments.find((e) => e.id === envId)?.name ?? null)
  )
  // Close if the environment disappears while open.
  const missing = envId !== null && name === null
  useEffect(() => {
    if (missing) onClose()
  }, [missing, onClose])

  return (
    <Dialog
      open={envId !== null && name !== null}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={`Variables · ${name ?? ''}`}
    >
      {/* Content unmounts on close, so the local copy is taken fresh on every open. */}
      {envId !== null && <EnvironmentForm id={envId} onClose={onClose} />}
    </Dialog>
  )
}

function EnvironmentForm({ id, onClose }: { id: string; onClose(): void }): React.JSX.Element {
  const updateEnvironment = useWorkspace((s) => s.updateEnvironment)
  const store = useWorkspaceStore()
  const [rows, setRows] = useState<KeyValue[]>(
    () =>
      store
        .getState()
        .environments.find((e) => e.id === id)
        ?.variables.map((v) => ({ ...v })) ?? []
  )
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    let ok: boolean
    try {
      ok = await updateEnvironment(id, (e) => ({ ...e, variables: rows }))
    } finally {
      setSaving(false)
    }
    if (ok) onClose()
  }

  return (
    <>
      <KeyValueGrid rows={rows} onChange={setRows} />
      <div className="moss-dialog__footer">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </>
  )
}
