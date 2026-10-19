import { useState } from 'react'
import { useWorkspace } from '../../state/workspace-hooks'
import { selectActiveEnvironment } from '../../state/selectors'
import { Popover } from '../../ui'
import { EnvironmentPopover } from './EnvironmentPopover'
import './EnvironmentChip.css'

/** Top-bar chip showing the active environment; opens the switcher popover. */
export function EnvironmentChip(): React.JSX.Element {
  const active = useWorkspace(selectActiveEnvironment)
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  return (
    <Popover
      aria-label="Environments"
      align="end"
      open={open}
      onOpenChange={setOpen}
      preventDismiss={dirty}
      trigger={
        <button
          type="button"
          className="env-chip"
          aria-label={`Environment: ${active ? active.name : 'none'}`}
        >
          <span
            className={active ? 'env-chip__dot env-chip__dot--active' : 'env-chip__dot'}
            aria-hidden="true"
          />
          <span className="env-chip__name">{active ? active.name : 'No environment'}</span>
        </button>
      }
    >
      <EnvironmentPopover onClose={() => setOpen(false)} onDirtyChange={setDirty} />
    </Popover>
  )
}
