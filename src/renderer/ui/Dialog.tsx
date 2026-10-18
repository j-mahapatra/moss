import * as RDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import './Dialog.css'

export type DialogProps = {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer
}: DialogProps): React.JSX.Element {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="moss-dialog__overlay" />
        <RDialog.Content
          className="moss-dialog"
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <RDialog.Title className="moss-dialog__title">{title}</RDialog.Title>
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
