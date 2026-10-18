import type { ReactNode } from 'react'
import './Badge.css'

export type BadgeTone = 'neutral' | 'accent' | '2xx' | '3xx' | '4xx' | '5xx' | 'danger'

export type BadgeProps = { tone: BadgeTone; children: ReactNode }

export function Badge({ tone, children }: BadgeProps): React.JSX.Element {
  return <span className={`moss-badge moss-badge--${tone}`}>{children}</span>
}
