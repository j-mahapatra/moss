import { Button, Dialog } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'

export function DiscardDialog(): React.JSX.Element {
  const pending = useWorkspace((s) => s.ui.confirmDiscard)
  const setPending = useWorkspace((s) => s.setConfirmDiscard)
  const confirm = useWorkspace((s) => s.confirmDiscard)
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
      title="Discard unsaved request?"
      description="Your unsaved changes to the current request will be lost."
      footer={
        <>
          <Button variant="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm}>
            Discard
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
