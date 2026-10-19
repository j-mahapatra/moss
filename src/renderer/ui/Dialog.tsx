import * as RDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cx } from './cx'
import './Dialog.css'

export type DialogProps = {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  /** Keep the title as the accessible name but hide it visually. */
  titleHidden?: boolean
  /** Extra class on the dialog surface, for layout variants. */
  className?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  /** Runs when focus is about to return to the trigger; `preventDefault` to place it elsewhere. */
  onCloseAutoFocus?(event: Event): void
  /** Runs on Escape before the dialog closes; `preventDefault` to keep it open. */
  onEscapeKeyDown?(event: KeyboardEvent): void
}

export function Dialog({
  open,
  onOpenChange,
  title,
  titleHidden = false,
  className,
  description,
  children,
  footer,
  onCloseAutoFocus,
  onEscapeKeyDown
}: DialogProps): React.JSX.Element {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="moss-dialog__overlay" />
        <RDialog.Content
          className={cx('moss-dialog', className)}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <RDialog.Title
            className={cx('moss-dialog__title', titleHidden && 'moss-visually-hidden')}
          >
            {title}
          </RDialog.Title>
          {description !== undefined && (
            <RDialog.Description className="moss-dialog__description">
              {description}
            </RDialog.Description>
          )}
          <div className="moss-dialog__body">{children}</div>
          {footer !== undefined && <div className="moss-dialog__footer">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
