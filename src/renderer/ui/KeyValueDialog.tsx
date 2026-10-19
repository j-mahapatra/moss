import { useState } from 'react'
import type { Variable } from '../../shared/types'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { KeyValueGrid } from './KeyValueGrid'

export type KeyValueDialogProps = {
  title: string
  open: boolean
  /** The saved rows. Each open edits a fresh copy; Cancel discards it. */
  rows: Variable[]
  /** Persists the edited rows. The dialog closes when it resolves true. */
  onSave(rows: Variable[]): Promise<boolean>
  onOpenChange(open: boolean): void
  keyPlaceholder: string
  /** Offer the per-row "mark secret" toggle (variables). */
  secretColumn?: boolean
}

export function KeyValueDialog({
  title,
  open,
  rows,
  onSave,
  onOpenChange,
  keyPlaceholder,
  secretColumn = false
}: KeyValueDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      {/* Content unmounts on close, so the local copy is taken fresh on every open. */}
      {open && (
        <KeyValueForm
          initial={rows}
          onSave={onSave}
          onClose={() => onOpenChange(false)}
          keyPlaceholder={keyPlaceholder}
          secretColumn={secretColumn}
        />
      )}
    </Dialog>
  )
}

function KeyValueForm({
  initial,
  onSave,
  onClose,
  keyPlaceholder,
  secretColumn
}: {
  initial: Variable[]
  onSave(rows: Variable[]): Promise<boolean>
  onClose(): void
  keyPlaceholder: string
  secretColumn: boolean
}): React.JSX.Element {
  const [rows, setRows] = useState<Variable[]>(() => initial.map((r) => ({ ...r })))
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    let ok: boolean
    try {
      ok = await onSave(rows)
    } finally {
      setSaving(false)
    }
    if (ok) onClose()
  }

  return (
    <>
      <KeyValueGrid
        rows={rows}
        onChange={setRows}
        keyPlaceholder={keyPlaceholder}
        secretColumn={secretColumn}
      />
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
