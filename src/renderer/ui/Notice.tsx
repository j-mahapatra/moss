import type { ReactNode } from 'react'
import { IconButton } from './IconButton'
import './Notice.css'

export type NoticeProps = {
  tone: 'warning' | 'danger'
  children: ReactNode
  onDismiss(): void
}

export function Notice({ tone, children, onDismiss }: NoticeProps): React.JSX.Element {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`moss-notice moss-notice--${tone}`}
    >
      <div className="moss-notice__message">{children}</div>
      <IconButton label="Dismiss" onClick={onDismiss}>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </IconButton>
    </div>
  )
}
