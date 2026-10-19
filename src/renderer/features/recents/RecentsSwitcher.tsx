import { useEffect, useId, useState } from 'react'
import type { StoreApi } from 'zustand'
import { selectRecentEntries } from '../../state/selectors'
import type { RequestRef, WorkspaceState } from '../../state/workspace'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import { Badge } from '../../ui/Badge'
import { Dialog } from '../../ui/Dialog'
import { useReturnFocus } from '../shell/useReturnFocus'
import './RecentsSwitcher.css'

/**
 * The ⌃Tab switcher over the recent requests. useShortcuts opens it; while ⌃ is held, Tab and
 * ⇧Tab move the selection, and releasing ⌃ (or Enter, or a click) opens the selected request.
 */
export function RecentsSwitcher(): React.JSX.Element {
  const open = useWorkspace((s) => s.ui.recentsOpen)
  const setOpen = useWorkspace((s) => s.setRecentsOpen)
  // ⌃Tab has no trigger for Radix to return focus to.
  const onCloseAutoFocus = useReturnFocus(open)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Recent requests"
      titleHidden
      className="moss-recents"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {/* Mounted only while open, so each opening picks its starting row afresh. */}
      <SwitcherBody onClose={() => setOpen(false)} />
    </Dialog>
  )
}

/** Opens `ref`, raising the discard confirmation when the current draft needs one. */
function openRecent(store: StoreApi<WorkspaceState>, ref: RequestRef): void {
  const st = store.getState()
  if (st.openRequest(ref) === 'confirm-discard') st.setConfirmDiscard({ then: 'open', ref })
}

function SwitcherBody({ onClose }: { onClose(): void }): React.JSX.Element {
  const store = useWorkspaceStore()
  const entries = useWorkspace(selectRecentEntries)
  // Start on the previous request; the first row is the current one when there is one.
  const [selected, setSelected] = useState(() => {
    const current = store.getState().active?.requestId
    return entries.length > 1 && entries[0]?.ref.requestId === current ? 1 : 0
  })
  const index = Math.min(selected, entries.length - 1)
  const baseId = useId()
  const optionId = (i: number): string => `${baseId}-option-${i}`

  useEffect(() => {
    const openAt = (i: number): void => {
      const entry = entries[i]
      onClose()
      if (entry) openRecent(store, entry.ref)
    }
    const move = (step: number): void => {
      if (entries.length > 0) setSelected((index + step + entries.length) % entries.length)
    }
    // Capture phase, ahead of the dialog's focus trap and anything focused inside it.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Tab' && e.ctrlKey) move(e.shiftKey ? -1 : 1)
      else if (e.key === 'ArrowDown') move(1)
      else if (e.key === 'ArrowUp') move(-1)
      else if (e.key === 'Enter') {
        // A held Enter must not open a second request once the first one closes the switcher.
        if (!e.repeat) openAt(index)
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control') openAt(index)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
    }
  }, [entries, index, onClose, store])

  return (
    <div
      role="listbox"
      aria-label="Recent requests"
      tabIndex={0}
      className="moss-recents__list"
      {...(index >= 0 ? { 'aria-activedescendant': optionId(index) } : {})}
    >
      {entries.map((entry, i) => (
        <div
          key={entry.ref.requestId}
          id={optionId(i)}
          role="option"
          aria-selected={i === index}
          data-name={entry.name}
          className="moss-recents__option"
          onMouseMove={() => {
            if (i !== index) setSelected(i)
          }}
          onClick={() => {
            onClose()
            openRecent(store, entry.ref)
          }}
        >
          <Badge tone="neutral">{entry.method}</Badge>
          <span className="moss-recents__name">{entry.name}</span>
          <span className="moss-recents__collection">{entry.collectionName}</span>
        </div>
      ))}
    </div>
  )
}
