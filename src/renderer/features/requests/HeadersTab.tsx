import { KeyValueGrid } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'

export function HeadersTab(): React.JSX.Element {
  const headers = useWorkspace((s) => s.draft.headers)
  const updateDraft = useWorkspace((s) => s.updateDraft)
  return (
    <KeyValueGrid
      rows={headers}
      keyPlaceholder="Header"
      onChange={(next) => updateDraft({ headers: next })}
    />
  )
}
