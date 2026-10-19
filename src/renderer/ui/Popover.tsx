import * as RPopover from '@radix-ui/react-popover'
import { useState, type ReactNode } from 'react'
import './Popover.css'

export type PopoverProps = {
  trigger: ReactNode
  open?: boolean
  onOpenChange?(open: boolean): void
  'aria-label': string
  children: ReactNode
  align?: 'start' | 'end'
  /** When true, Esc, outside clicks and focus leaving do not dismiss it. */
  preventDismiss?: boolean
}

export function Popover({
  trigger,
  open: openProp,
  onOpenChange,
  'aria-label': ariaLabel,
  children,
  align = 'start',
  preventDismiss = false
}: PopoverProps): React.JSX.Element {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = openProp ?? innerOpen
  // Radix's trigger toggle calls this directly, bypassing the content's dismiss
  // handlers, so the guard lives here: drop close requests while prevented.
  const handleOpenChange = (next: boolean): void => {
    if (!next && preventDismiss) return
    if (openProp === undefined) setInnerOpen(next)
    onOpenChange?.(next)
  }
  return (
    <RPopover.Root open={open} onOpenChange={handleOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          className="moss-popover"
          aria-label={ariaLabel}
          align={align}
          sideOffset={6}
          onEscapeKeyDown={(e) => {
            if (preventDismiss) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (preventDismiss) e.preventDefault()
          }}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  )
}
