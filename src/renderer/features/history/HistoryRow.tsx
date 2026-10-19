import { statusLabel } from '../../../shared/history'
import { formatDuration } from '../../../shared/format'
import type { HistoryEntry } from '../../../shared/types'
import { Badge, IconButton, Menu } from '../../ui'
import { MoreIcon } from '../shell/icons'
import { rowKeyHandler, useDeferredMenuAction } from '../shell/row-helpers'

export type HistoryRowActions = {
  open(): void
  saveToCollection(): void
  remove(): void
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
  const { wrap, onCloseAutoFocus } = useDeferredMenuAction()
  return (
    <Menu
      aria-label={`Actions for ${label}`}
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      items={[
        { label: 'Open', onSelect: wrap(actions.open) },
        { label: 'Save to collection…', onSelect: wrap(actions.saveToCollection) },
        { separator: true },
        { label: 'Delete', onSelect: wrap(actions.remove), tone: 'danger' }
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
      onKeyDown={rowKeyHandler({
        open: actions.open,
        remove: actions.remove,
        menu: () => onMenuOpenChange(true)
      })}
    >
      <span className="history-row__method">{entry.request.method}</span>
      {url ? (
        <span className="history-row__url" title={url}>
          {url}
        </span>
      ) : (
        <span className="history-row__url history-row__url--empty">(no URL)</span>
      )}
      <Badge tone={status.tone}>{status.text}</Badge>
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
