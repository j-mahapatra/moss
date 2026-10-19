import { useLayoutEffect, useRef } from 'react'

/**
 * For a dialog opened by a shortcut, which leaves Radix no trigger to return focus to:
 * remembers where focus was when `open` became true and returns an `onCloseAutoFocus` that
 * puts it back. An action that placed focus itself (anywhere but <body>) keeps it.
 */
export function useReturnFocus(open: boolean): (event: Event) => void {
  // A layout effect runs before the dialog's focus scope moves focus into it.
  const returnFocus = useRef<Element | null>(null)
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement
  }, [open])

  return (event) => {
    event.preventDefault()
    const target = returnFocus.current
    returnFocus.current = null
    const at = document.activeElement
    if (at !== null && at !== document.body) return
    if (target instanceof HTMLElement && target.isConnected) target.focus()
  }
}
