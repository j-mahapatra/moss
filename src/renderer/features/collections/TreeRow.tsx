import type { HttpMethod } from '../../../shared/types'
import { ChevronIcon } from '../shell/icons'
import { cx } from '../../ui/cx'
import { ItemMenu, type ItemActions, type RowKind } from './ItemMenu'
import type { DropPosition } from './dnd'
import { RenameInput } from './RenameInput'

export type RowModel = {
  key: string
  kind: RowKind
  id: string
  collectionId: string
  name: string
  /** 1-based tree level. */
  level: number
  setSize: number
  posInSet: number
  parentKey: string | null
  method?: HttpMethod
  expandable: boolean
  expanded: boolean
}

type Props = {
  row: RowModel
  tabIndex: 0 | -1
  selected: boolean
  dirty: boolean
  renaming: boolean
  menuOpen: boolean
  /** Drop indicator drawn on this row, if it is the current valid target. */
  dropPosition: DropPosition | null
  actions: ItemActions
  onMenuOpenChange(open: boolean): void
  /** Row-level keys (open, rename, delete, menu); navigation is handled by the tree. */
  onKeyDown(e: React.KeyboardEvent<HTMLElement>): void
  onActivate(): void
  onContextMenu(e: React.MouseEvent): void
  onFocus(): void
  onRenameCommit(name: string): void
  onRenameCancel(reason: 'esc' | 'blur'): void
  onDragStart(e: React.DragEvent): void
  onDragOver(e: React.DragEvent): void
  onDragLeave(e: React.DragEvent): void
  onDrop(e: React.DragEvent): void
  onDragEnd(e: React.DragEvent): void
}

export function TreeRow(p: Props): React.JSX.Element {
  const { row } = p
  return (
    <div
      role="treeitem"
      aria-label={row.name}
      aria-level={row.level}
      aria-setsize={row.setSize}
      aria-posinset={row.posInSet}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={row.kind === 'request' ? p.selected : undefined}
      tabIndex={p.tabIndex}
      data-row-key={row.key}
      draggable={row.kind !== 'collection' && !p.renaming}
      className={cx(
        'tree-row',
        p.selected && 'tree-row--selected',
        p.dropPosition && `tree-row--drop-${p.dropPosition}`
      )}
      style={{ '--level': row.level - 1 } as React.CSSProperties}
      onClick={(e) => {
        // The menu is portaled, but React still bubbles its events through the row.
        if (e.currentTarget.contains(e.target as Node)) p.onActivate()
      }}
      onContextMenu={(e) => {
        if (e.currentTarget.contains(e.target as Node)) p.onContextMenu(e)
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget) p.onFocus()
      }}
      onKeyDown={p.onKeyDown}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
    >
      <span className={cx('tree-row__chevron', row.expanded && 'tree-row__chevron--open')}>
        {row.expandable && <ChevronIcon />}
      </span>
      {row.method && <span className="tree-row__method">{row.method}</span>}
      {p.renaming ? (
        <RenameInput initial={row.name} onCommit={p.onRenameCommit} onCancel={p.onRenameCancel} />
      ) : (
        <span className="tree-row__name">{row.name}</span>
      )}
      {p.dirty && <span className="tree-row__dot" role="img" aria-label="Unsaved changes" />}
      {!p.renaming && (
        <ItemMenu
          kind={row.kind}
          name={row.name}
          open={p.menuOpen}
          onOpenChange={p.onMenuOpenChange}
          actions={p.actions}
        />
      )}
    </div>
  )
}
