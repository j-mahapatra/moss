import { useState } from 'react'

type Pending = { fn: () => void; moves: boolean }

/**
 * Defers a row menu's actions until the menu has fully closed. Opening a dialog or an input
 * while the modal menu is still tearing down leaves the page with pointer-events disabled.
 * Pass `onCloseAutoFocus` to the menu and `wrap` each item's action.
 */
export function useDeferredMenuAction(): {
  /** `moves`: the action places focus itself (a rename input), so the trigger must not take it. */
  wrap(fn: () => void, moves?: boolean): () => void
  onCloseAutoFocus(e: Event): void
} {
  const [pending, setPending] = useState<Pending | null>(null)
  return {
    wrap:
      (fn, moves = false) =>
      () =>
        setPending({ fn, moves }),
    onCloseAutoFocus: (e) => {
      const next = pending
      setPending(null)
      if (next?.moves) e.preventDefault()
      next?.fn()
    }
  }
}

export type RowKeyActions = {
  /** Enter. */
  open?(): void
  /** Delete or Backspace. */
  remove?(): void
  /** F2. */
  rename?(): void
  /** ContextMenu or Shift+F10. */
  menu?(): void
}

/**
 * Keydown handler for a focusable row. Only keys pressed on the row itself count (not its
 * rename input or portaled menu), meta/ctrl combinations are left to app-level shortcuts, and
 * a held Enter, Delete or Backspace does not repeat. Keys without an action stay unhandled.
 */
export function rowKeyHandler(
  actions: RowKeyActions
): (e: React.KeyboardEvent<HTMLElement>) => void {
  return (e) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey) return
    let action: (() => void) | undefined
    switch (e.key) {
      case 'Enter':
        action = e.repeat ? undefined : actions.open
        break
      case 'Delete':
      case 'Backspace':
        action = e.repeat ? undefined : actions.remove
        break
      case 'F2':
        action = actions.rename
        break
      case 'ContextMenu':
        action = actions.menu
        break
      case 'F10':
        action = e.shiftKey ? actions.menu : undefined
        break
    }
    if (!action) return
    action()
    e.preventDefault()
  }
}

/** After `list[removedIndex]` is removed, focuses the next row, else the previous, else `fallback`. */
export function focusAfterRemove(
  list: HTMLElement[],
  removedIndex: number,
  fallback: HTMLElement | null
): void {
  const target = list[removedIndex + 1] ?? list[removedIndex - 1] ?? fallback
  target?.focus()
}
