import { useState } from 'react'
import { IconButton, Menu, type MenuItem } from '../../ui'
import { MoreIcon } from '../shell/icons'

export type RowKind = 'collection' | 'folder' | 'request'

export type ItemActions = {
  open(): void
  newRequest(): void
  newFolder(): void
  variables(): void
  exportCollection(): void
  rename(): void
  duplicate(): void
  remove(): void
}

function menuItemsFor(kind: RowKind, a: ItemActions): MenuItem[] {
  const del: MenuItem = { label: 'Delete', onSelect: a.remove, tone: 'danger' }
  if (kind === 'collection') {
    return [
      { label: 'New request', onSelect: a.newRequest },
      { label: 'New folder', onSelect: a.newFolder },
      { label: 'Variables…', onSelect: a.variables },
      { label: 'Export…', onSelect: a.exportCollection },
      { label: 'Rename', onSelect: a.rename },
      { separator: true },
      del
    ]
  }
  if (kind === 'folder') {
    return [
      { label: 'New request', onSelect: a.newRequest },
      { label: 'New folder', onSelect: a.newFolder },
      { label: 'Rename', onSelect: a.rename },
      { label: 'Duplicate', onSelect: a.duplicate },
      { separator: true },
      del
    ]
  }
  return [
    { label: 'Open', onSelect: a.open },
    { label: 'Rename', onSelect: a.rename },
    { label: 'Duplicate', onSelect: a.duplicate },
    { separator: true },
    del
  ]
}

type Props = {
  kind: RowKind
  name: string
  open: boolean
  onOpenChange(open: boolean): void
  actions: ItemActions
}

export function ItemMenu({ kind, name, open, onOpenChange, actions }: Props): React.JSX.Element {
  // Actions run once the menu has fully closed: opening a dialog (or an input) while the
  // modal menu is still tearing down leaves the page with pointer-events disabled.
  const [pending, setPending] = useState<{ fn: () => void; moves: boolean } | null>(null)
  const wrap = (fn: () => void, moves: boolean) => (): void => {
    setPending({ fn, moves })
  }
  const wrapped: ItemActions = {
    open: wrap(actions.open, false),
    newRequest: wrap(actions.newRequest, false),
    newFolder: wrap(actions.newFolder, true),
    variables: wrap(actions.variables, false),
    exportCollection: wrap(actions.exportCollection, false),
    rename: wrap(actions.rename, true),
    duplicate: wrap(actions.duplicate, false),
    remove: wrap(actions.remove, false)
  }
  return (
    <Menu
      aria-label={`Actions for ${name}`}
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={(e) => {
        const next = pending
        setPending(null)
        // An action that moves focus itself (rename input) must not lose it to the trigger.
        if (next?.moves) e.preventDefault()
        next?.fn()
      }}
      items={menuItemsFor(kind, wrapped)}
      trigger={
        <IconButton
          label="More actions"
          aria-haspopup="menu"
          tabIndex={-1}
          className="tree-row__more"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreIcon />
        </IconButton>
      }
    />
  )
}
