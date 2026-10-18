import * as RMenu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cx } from './cx'
import './Menu.css'

export type MenuItem =
  { label: string; onSelect(): void; tone?: 'danger'; disabled?: boolean } | { separator: true }

export type MenuProps = {
  trigger: ReactNode
  items: MenuItem[]
  open?: boolean
  onOpenChange?(open: boolean): void
  /** Call `event.preventDefault()` to keep focus where an action just put it. */
  onCloseAutoFocus?(event: Event): void
  'aria-label': string
}

export function Menu({
  trigger,
  items,
  open,
  onOpenChange,
  onCloseAutoFocus,
  'aria-label': ariaLabel
}: MenuProps): React.JSX.Element {
  return (
    <RMenu.Root open={open} onOpenChange={onOpenChange}>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          className="moss-menu"
          aria-label={ariaLabel}
          aria-labelledby={undefined}
          align="start"
          sideOffset={4}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {items.map((item, i) =>
            'separator' in item ? (
              <RMenu.Separator key={`sep-${i}`} className="moss-menu__separator" />
            ) : (
              <RMenu.Item
                key={`${i}-${item.label}`}
                className={cx(
                  'moss-menu__item',
                  item.tone === 'danger' && 'moss-menu__item--danger'
                )}
                disabled={item.disabled}
                onSelect={() => item.onSelect()}
              >
                {item.label}
              </RMenu.Item>
            )
          )}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  )
}
