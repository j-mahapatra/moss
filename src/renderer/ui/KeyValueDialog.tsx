import { useState } from 'react'
import type { KeyValue } from '../../shared/types'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { KeyValueGrid } from './KeyValueGrid'

export type KeyValueDialogProps = {
  title: string
  open: boolean
  /** The saved rows. Each open edits a fresh copy; Cancel discards it. */
  rows: KeyValue[]
  /** Persists the edited rows. The dialog closes when it resolves true. */
  onSave(rows: KeyValue[]): Promise<boolean>
  onOpenChange(open: boolean): void
  keyPlaceholder: string
}

export function KeyValueDialog({
  title,
  open,
  rows,
  onSave,
  onOpenChange,
  keyPlaceholder
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
        />
      )}
    </Dialog>
  )
}

function KeyValueForm({
  initial,
  onSave,
  onClose,
  keyPlaceholder
}: {
  initial: KeyValue[]
  onSave(rows: KeyValue[]): Promise<boolean>
  onClose(): void
  keyPlaceholder: string
}): React.JSX.Element {
  const [rows, setRows] = useState<KeyValue[]>(() => initial.map((r) => ({ ...r })))
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
      <KeyValueGrid rows={rows} onChange={setRows} keyPlaceholder={keyPlaceholder} />
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
