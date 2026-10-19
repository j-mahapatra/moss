import { useCallback, useEffect, useState } from 'react'
import { deepEqual } from '../../../shared/equal'
import type { Environment, KeyValue } from '../../../shared/types'
import { selectActiveEnvironment } from '../../state/selectors'
import { byName } from '../../state/slices/collections'
import { useWorkspace } from '../../state/workspace-hooks'
import { Button, KeyValueGrid } from '../../ui'
import './EnvironmentPopover.css'

/**
 * Edits a local copy of the environment's variables. `edits` is null until the user types, so
 * store changes from elsewhere show through while the copy is clean. The parent keys this by
 * environment id, which discards the copy when the active environment changes.
 */
function VariablesEditor({
  env,
  onDirtyChange
}: {
  env: Environment
  onDirtyChange(dirty: boolean): void
}): React.JSX.Element {
  const updateEnvironment = useWorkspace((s) => s.updateEnvironment)
  const [edits, setEdits] = useState<KeyValue[] | null>(null)
  const rows = edits ?? env.variables
  const dirty = edits !== null && !deepEqual(edits, env.variables)

  // Report dirtiness upward so the popover can refuse to dismiss; clear it on unmount.
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  const save = async (): Promise<void> => {
    if (edits === null) return
    const variables = edits
    if (await updateEnvironment(env.id, (e) => ({ ...e, variables }))) {
      // Rows typed while the save was in flight stay as unsaved edits.
      setEdits((cur) => (cur === variables ? null : cur))
    }
  }

  return (
    <section className="env-popover__section" aria-label="Variables">
      <h3 className="env-popover__heading">Variables</h3>
      <KeyValueGrid rows={rows} onChange={setEdits} />
      {dirty && (
        <p role="status" className="env-popover__hint">
          Save or discard your changes
        </p>
      )}
      <div className="env-popover__actions">
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => setEdits(null)}>
            Discard changes
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </section>
  )
}

export function EnvironmentPopover({
  onClose,
  onDirtyChange
}: {
  onClose(): void
  onDirtyChange?(dirty: boolean): void
}): React.JSX.Element {
  const [dirty, setDirty] = useState(false)
  const reportDirty = useCallback(
    (d: boolean): void => {
      setDirty(d)
      onDirtyChange?.(d)
    },
    [onDirtyChange]
  )
  const environments = useWorkspace((s) => s.environments)
  const active = useWorkspace(selectActiveEnvironment)
  const setActiveEnvironment = useWorkspace((s) => s.setActiveEnvironment)
  const createEnvironment = useWorkspace((s) => s.createEnvironment)
  const showPanel = useWorkspace((s) => s.showPanel)
  const sorted = [...environments].sort(byName)

  const create = async (): Promise<void> => {
    const created = await createEnvironment('New environment')
    if (created) setActiveEnvironment(created.id)
  }

  return (
    <div className="env-popover">
      <fieldset className="env-popover__group">
        <legend className="env-popover__legend">Active environment</legend>
        <label className="env-popover__option">
          <input
            type="radio"
            name="moss-active-env"
            checked={active === null}
            onChange={() => setActiveEnvironment(null)}
          />
          <span>No environment</span>
        </label>
        {sorted.map((e) => (
          <label key={e.id} className="env-popover__option">
            <input
              type="radio"
              name="moss-active-env"
              checked={active?.id === e.id}
              onChange={() => setActiveEnvironment(e.id)}
            />
            <span>{e.name}</span>
          </label>
        ))}
      </fieldset>

      {environments.length === 0 && (
        <div className="env-popover__actions">
          <Button variant="secondary" size="sm" onClick={() => void create()}>
            Create environment
          </Button>
        </div>
      )}

      {active && <VariablesEditor key={active.id} env={active} onDirtyChange={reportDirty} />}

      <div className="env-popover__footer">
        <Button
          variant="ghost"
          size="sm"
          disabled={dirty}
          onClick={() => {
            onClose()
            showPanel('environments')
          }}
        >
          Manage environments
        </Button>
      </div>
    </div>
  )
}
