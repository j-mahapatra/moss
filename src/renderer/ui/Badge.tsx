import type { HTMLAttributes, ReactNode } from 'react'
import './Badge.css'

export type BadgeTone = 'neutral' | 'accent' | '2xx' | '3xx' | '4xx' | '5xx' | 'danger'

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & {
  tone: BadgeTone
  children: ReactNode
}

export function Badge({ tone, children, ...rest }: BadgeProps): React.JSX.Element {
  return (
    <span className={`moss-badge moss-badge--${tone}`} {...rest}>
      {children}
    </span>
  )
}
