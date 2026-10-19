import * as RPopover from '@radix-ui/react-popover'
import type { ReactNode } from 'react'
import './Popover.css'

export type PopoverProps = {
  trigger: ReactNode
  open?: boolean
  onOpenChange?(open: boolean): void
  'aria-label': string
  children: ReactNode
  align?: 'start' | 'end'
}

export function Popover({
  trigger,
  open,
  onOpenChange,
  'aria-label': ariaLabel,
  children,
  align = 'start'
}: PopoverProps): React.JSX.Element {
  return (
    <RPopover.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          className="moss-popover"
          aria-label={ariaLabel}
          align={align}
          sideOffset={6}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  )
}
