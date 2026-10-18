import * as RTabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import './Tabs.css'

export type TabItem = { value: string; label: string }

export type TabsProps = {
  value: string
  onValueChange(value: string): void
  tabs: TabItem[]
  /** Content for the active tab; the caller decides what to render. */
  children: ReactNode
}

export function Tabs({ value, onValueChange, tabs, children }: TabsProps): React.JSX.Element {
  return (
    <RTabs.Root className="moss-tabs" value={value} onValueChange={onValueChange}>
      <RTabs.List className="moss-tabs__list">
        {tabs.map((t) => (
          <RTabs.Trigger key={t.value} value={t.value} className="moss-tabs__trigger">
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      <RTabs.Content value={value} className="moss-tabs__panel">
        {children}
      </RTabs.Content>
    </RTabs.Root>
  )
}
