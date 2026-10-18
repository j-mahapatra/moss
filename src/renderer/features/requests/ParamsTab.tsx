import { applyParams } from '../../../shared/url-params'
import { KeyValueGrid } from '../../ui'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'

export function ParamsTab(): React.JSX.Element {
  const store = useWorkspaceStore()
  const params = useWorkspace((s) => s.draft.params)
  return (
    <KeyValueGrid
      rows={params}
      keyPlaceholder="Parameter"
      onChange={(next) =>
        store.getState().updateDraft({
          params: next,
          url: applyParams(store.getState().draft.url, next)
        })
      }
    />
  )
}
