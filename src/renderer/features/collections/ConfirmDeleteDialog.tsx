import { Button, Dialog } from '../../ui'

export type DeleteTarget = {
  kind: 'collection' | 'folder' | 'request' | 'environment'
  id: string
  /** Unused for environments. */
  collectionId?: string
  name: string
  /** Environments only: the one requests currently use. */
  active?: boolean
}

type Props = {
  target: DeleteTarget | null
  onCancel(): void
  onConfirm(target: DeleteTarget): void
}

export function ConfirmDeleteDialog({ target, onCancel, onConfirm }: Props): React.JSX.Element {
  // Keep the last target while the dialog animates out / for stable copy.
  const description =
    target?.kind === 'environment'
      ? `This can't be undone.${target.active ? ' Requests will stop using its variables.' : ''}`
      : target && target.kind !== 'request'
        ? "This can't be undone. Everything inside it will be deleted too."
        : "This can't be undone."
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={`Delete “${target?.name ?? ''}”?`}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => target && onConfirm(target)}>
            Delete
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
