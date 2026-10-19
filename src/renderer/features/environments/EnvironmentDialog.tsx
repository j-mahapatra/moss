import { useEffect } from 'react'
import type { KeyValue } from '../../../shared/types'
import { useWorkspace } from '../../state/workspace-hooks'
import { KeyValueDialog } from '../../ui'

const NO_ROWS: KeyValue[] = []

type Props = {
  /** Id of the environment being edited, or null when closed. */
  envId: string | null
  onClose(): void
}

export function EnvironmentDialog({ envId, onClose }: Props): React.JSX.Element {
  const updateEnvironment = useWorkspace((s) => s.updateEnvironment)
  const environment = useWorkspace((s) =>
    envId === null ? null : (s.environments.find((e) => e.id === envId) ?? null)
  )
  // Close if the environment disappears while open.
  const missing = envId !== null && environment === null
  useEffect(() => {
    if (missing) onClose()
  }, [missing, onClose])

  return (
    <KeyValueDialog
      title={`Variables · ${environment?.name ?? ''}`}
      open={envId !== null && environment !== null}
      rows={environment?.variables ?? NO_ROWS}
      keyPlaceholder="Key"
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      onSave={(rows) =>
        envId === null
          ? Promise.resolve(false)
          : updateEnvironment(envId, (e) => ({ ...e, variables: rows }))
      }
    />
  )
}
