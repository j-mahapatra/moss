import { useState } from 'react'
import { statusLabel, type StatusTone } from '../../../shared/history'
import { formatDuration } from '../../../shared/format'
import type { HistoryEntry } from '../../../shared/types'
import type { BadgeTone } from '../../ui/Badge'
import { Badge, IconButton, Menu } from '../../ui'
import { MoreIcon } from '../shell/icons'

export type HistoryRowActions = {
  open(): void
  saveToCollection(): void
  remove(): void
}

const TONES: Record<StatusTone, BadgeTone> = {
  '2xx': '2xx',
  '3xx': '3xx',
  '4xx': '4xx',
  '5xx': '5xx',
  neutral: 'neutral',
  danger: 'danger'
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function HistoryMenu({
  label,
  open,
  onOpenChange,
  actions
}: {
  label: string
  open: boolean
  onOpenChange(open: boolean): void
  actions: HistoryRowActions
}): React.JSX.Element {
  // Actions run once the menu has fully closed, so dialogs don't fight its teardown.
  const [pending, setPending] = useState<(() => void) | null>(null)
  return (
    <Menu
      aria-label={`Actions for ${label}`}
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={() => {
        const fn = pending
        setPending(null)
        fn?.()
      }}
      items={[
        { label: 'Open', onSelect: () => setPending(() => actions.open) },
        {
          label: 'Save to collection…',
          onSelect: () => setPending(() => actions.saveToCollection)
        },
        { separator: true },
        { label: 'Delete', onSelect: () => setPending(() => actions.remove), tone: 'danger' }
      ]}
      trigger={
        <IconButton
          label="More actions"
          aria-haspopup="menu"
          tabIndex={-1}
          className="history-row__more"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreIcon />
        </IconButton>
      }
    />
  )
}

export function HistoryRow({
  entry,
  menuOpen,
  onMenuOpenChange,
  actions
}: {
  entry: HistoryEntry
  menuOpen: boolean
  onMenuOpenChange(open: boolean): void
  actions: HistoryRowActions
}): React.JSX.Element {
  const status = statusLabel(entry)
  const url = entry.request.url
  const label = `${entry.request.method} ${url || '(no URL)'}`
  return (
    <div
      role="listitem"
      aria-label={label}
      tabIndex={0}
      data-history-id={entry.id}
      className="history-row"
      onClick={(e) => {
        if ((e.target as Element).closest('button,input')) return
        actions.open()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.currentTarget.focus()
        onMenuOpenChange(true)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey) return
        if (e.key === 'Enter') actions.open()
        else if (e.key === 'Delete' || e.key === 'Backspace') actions.remove()
        else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) onMenuOpenChange(true)
        else return
        e.preventDefault()
      }}
    >
      <span className="history-row__method">{entry.request.method}</span>
      {url ? (
        <span className="history-row__url" title={url}>
          {url}
        </span>
      ) : (
        <span className="history-row__url history-row__url--empty">(no URL)</span>
      )}
      <Badge tone={TONES[status.tone]}>{status.text}</Badge>
      <span className="history-row__meta">{timeFormat.format(new Date(entry.at))}</span>
      <span className="history-row__meta">{formatDuration(entry.durationMs)}</span>
      <HistoryMenu
        label={label}
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        actions={actions}
      />
    </div>
  )
}
