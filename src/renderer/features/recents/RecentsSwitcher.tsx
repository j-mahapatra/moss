import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { StoreApi } from 'zustand'
import { selectRecentEntries } from '../../state/selectors'
import type { RequestRef, WorkspaceState } from '../../state/workspace'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import { Badge } from '../../ui/Badge'
import { Dialog } from '../../ui/Dialog'
import { keepOpenWhileComposing } from '../../ui/ime'
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
  const close = useCallback(() => setOpen(false), [setOpen])
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Recent requests"
      titleHidden
      className="moss-recents"
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={keepOpenWhileComposing}
    >
      {/* Mounted only while open, so each opening picks its starting row afresh. */}
      <SwitcherBody onClose={close} />
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
  // The selection follows its request, so rows vanishing around it don't move it.
  const [selected, setSelected] = useState(() => {
    const current = store.getState().active?.requestId
    const i = entries.length > 1 && entries[0]?.ref.requestId === current ? 1 : 0
    return { requestId: entries[i]?.ref.requestId, index: i }
  })
  const found = entries.findIndex((e) => e.ref.requestId === selected.requestId)
  const index = found >= 0 ? found : Math.min(selected.index, entries.length - 1)
  // The selected request vanished: the row now in its place becomes the selection.
  const anchor = found < 0 ? entries[index]?.ref.requestId : undefined
  if (anchor !== undefined) setSelected({ requestId: anchor, index })
  const baseId = useId()
  const optionId = (i: number): string => `${baseId}-option-${i}`
  const select = (i: number): void =>
    setSelected({ requestId: entries[i]?.ref.requestId, index: i })

  // The listeners read the latest render through a ref, so they are registered once per opening.
  const latest = useRef({ entries, index })
  useLayoutEffect(() => {
    latest.current = { entries, index }
  })

  // Layout effect, so the listeners are in place before the browser can deliver a quick
  // Ctrl release that follows the opening press.
  useLayoutEffect(() => {
    const openAt = (i: number): void => {
      const entry = latest.current.entries[i]
      onClose()
      if (entry) openRecent(store, entry.ref)
    }
    const move = (step: number): void => {
      const { entries: list, index: at } = latest.current
      if (list.length === 0) return
      const next = (at + step + list.length) % list.length
      setSelected({ requestId: list[next]?.ref.requestId, index: next })
    }
    // Capture phase, ahead of the dialog's focus trap and anything focused inside it.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Tab' && e.ctrlKey) move(e.shiftKey ? -1 : 1)
      else if (e.key === 'ArrowDown') move(1)
      else if (e.key === 'ArrowUp') move(-1)
      else if (e.key === 'Enter') {
        // A held Enter must not open a second request once the first one closes the switcher.
        if (!e.repeat) openAt(latest.current.index)
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control') openAt(latest.current.index)
    }
    // Ctrl may be released in another window, where the keyup never reaches us: close quietly.
    const onBlur = (): void => onClose()
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose, store])

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
            if (i !== index) select(i)
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
