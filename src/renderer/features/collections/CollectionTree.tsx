import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  duplicateItem,
  insertItem,
  newFolder,
  removeItem,
  renameItem,
  toItem
} from '../../../shared/collection-tree'
import { newRequestSpec, type Collection, type Item } from '../../../shared/types'
import { selectDirtyIds } from '../../state/selectors'
import { useWorkspace } from '../../state/workspace-hooks'
import { ConfirmDeleteDialog, type DeleteTarget } from './ConfirmDeleteDialog'
import type { ItemActions } from './ItemMenu'
import { TreeRow, type RowModel } from './TreeRow'
import './CollectionTree.css'

type Props = {
  /** Collection or item id whose row is in inline rename. Owned by the Navigator (P1). */
  renamingId: string | null
  onRenamingChange(id: string | null): void
}

/** Flattens the visible rows in render order. */
function flatten(collections: Collection[], isExpanded: (key: string) => boolean): RowModel[] {
  const rows: RowModel[] = []
  const walk = (items: Item[], c: Collection, level: number, parentKey: string): void => {
    items.forEach((it, i) => {
      const expandable = it.kind === 'folder'
      const expanded = expandable && isExpanded(it.id)
      rows.push({
        key: it.id,
        kind: it.kind,
        id: it.id,
        collectionId: c.id,
        name: it.name,
        level,
        setSize: items.length,
        posInSet: i + 1,
        parentKey,
        ...(it.kind === 'request' ? { method: it.method } : {}),
        expandable,
        expanded
      })
      if (it.kind === 'folder' && expanded) walk(it.items, c, level + 1, it.id)
    })
  }
  collections.forEach((c, i) => {
    const expanded = isExpanded(c.id)
    rows.push({
      key: c.id,
      kind: 'collection',
      id: c.id,
      collectionId: c.id,
      name: c.name,
      level: 1,
      setSize: collections.length,
      posInSet: i + 1,
      parentKey: null,
      expandable: true,
      expanded
    })
    if (expanded) walk(c.items, c, 2, c.id)
  })
  return rows
}

export function CollectionTree({ renamingId, onRenamingChange }: Props): React.JSX.Element {
  const collections = useWorkspace((s) => s.collections)
  const active = useWorkspace((s) => s.active)
  const dirty = useWorkspace(selectDirtyIds)
  const openRequest = useWorkspace((s) => s.openRequest)
  const setConfirmDiscard = useWorkspace((s) => s.setConfirmDiscard)
  const updateCollection = useWorkspace((s) => s.updateCollection)
  const deleteCollection = useWorkspace((s) => s.deleteCollection)
  const openVariables = useWorkspace((s) => s.openVariables)

  // Collections start expanded, folders collapsed; this records user overrides.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const refocus = useRef<string | null>(null)

  const collectionIds = useMemo(() => new Set(collections.map((c) => c.id)), [collections])
  const isExpanded = useCallback(
    (key: string): boolean => overrides[key] ?? collectionIds.has(key),
    [overrides, collectionIds]
  )
  const rows = useMemo(() => flatten(collections, isExpanded), [collections, isExpanded])

  const activeKey = active?.requestId ?? null
  const tabKey =
    (focusKey && rows.some((r) => r.key === focusKey) ? focusKey : null) ??
    (activeKey && rows.some((r) => r.key === activeKey) ? activeKey : null) ??
    rows[0]?.key ??
    null

  const focusRow = useCallback((key: string): void => {
    setFocusKey(key)
    treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${key}"]`)?.focus()
  }, [])

  // Return focus to a row after an inline rename ends (its input unmounts).
  useEffect(() => {
    if (renamingId === null && refocus.current) {
      const key = refocus.current
      refocus.current = null
      treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${key}"]`)?.focus()
    }
  })

  const setOpen = (key: string, open: boolean): void => setOverrides((o) => ({ ...o, [key]: open }))

  const open = (row: RowModel): void => {
    const ref = { collectionId: row.collectionId, requestId: row.id }
    if (openRequest(ref) === 'confirm-discard') setConfirmDiscard({ then: 'open', ref })
  }

  const addItem = async (row: RowModel, item: Item): Promise<boolean> => {
    const parentId = row.kind === 'collection' ? null : row.id
    setOpen(row.key, true)
    return updateCollection(row.collectionId, (c) => insertItem(c, parentId, item))
  }

  const actionsFor = (row: RowModel): ItemActions => ({
    open: () => open(row),
    newRequest: () => {
      const item = toItem({ ...newRequestSpec(), name: 'Untitled request' })
      void addItem(row, item).then((saved) => {
        if (saved) open({ ...row, id: item.id, key: item.id, kind: 'request' })
      })
    },
    newFolder: () => {
      const folder = newFolder('New folder')
      void addItem(row, folder).then((saved) => {
        if (saved) onRenamingChange(folder.id)
      })
    },
    variables: () => openVariables(row.collectionId),
    rename: () => onRenamingChange(row.key),
    duplicate: () => {
      void updateCollection(row.collectionId, (c) => duplicateItem(c, row.id)?.collection ?? c)
    },
    remove: () =>
      setDeleteTarget({
        kind: row.kind,
        id: row.id,
        collectionId: row.collectionId,
        name: row.name
      })
  })

  const commitRename = (row: RowModel, name: string): void => {
    refocus.current = row.key
    onRenamingChange(null)
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === row.name) return
    if (row.kind === 'collection') {
      void updateCollection(row.id, (c) => ({ ...c, name: trimmed }))
    } else {
      void updateCollection(row.collectionId, (c) => renameItem(c, row.id, trimmed))
    }
  }

  const confirmDelete = (t: DeleteTarget): void => {
    setDeleteTarget(null)
    if (t.kind === 'collection') void deleteCollection(t.id)
    else void updateCollection(t.collectionId, (c) => removeItem(c, t.id))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const el = e.target as HTMLElement
    if (el.getAttribute('role') !== 'treeitem') return // ignore inputs, menu buttons, portals
    const idx = rows.findIndex((r) => r.key === el.getAttribute('data-row-key'))
    const row = rows[idx]
    if (!row) return
    const go = (r: RowModel | undefined): void => {
      if (r) focusRow(r.key)
    }
    switch (e.key) {
      case 'ArrowDown':
        go(rows[idx + 1])
        break
      case 'ArrowUp':
        go(rows[idx - 1])
        break
      case 'Home':
        go(rows[0])
        break
      case 'End':
        go(rows[rows.length - 1])
        break
      case 'ArrowRight':
        if (!row.expandable) return
        if (!row.expanded) setOpen(row.key, true)
        else go(rows[idx + 1])
        break
      case 'ArrowLeft':
        if (row.expandable && row.expanded) setOpen(row.key, false)
        else go(rows.find((r) => r.key === row.parentKey))
        break
      case 'Enter':
        if (row.kind === 'request') open(row)
        else setOpen(row.key, !row.expanded)
        break
      case 'F2':
        onRenamingChange(row.key)
        break
      case 'Delete':
      case 'Backspace':
        if (row.kind === 'collection') return
        actionsFor(row).remove()
        break
      case 'ContextMenu':
        setMenuKey(row.key)
        break
      case 'F10':
        if (!e.shiftKey) return
        setMenuKey(row.key)
        break
      default:
        return
    }
    e.preventDefault()
  }

  return (
    <>
      <div
        ref={treeRef}
        role="tree"
        aria-label="Collections"
        className="collection-tree"
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => (
          <TreeRow
            key={row.key}
            row={row}
            tabIndex={row.key === tabKey ? 0 : -1}
            selected={row.kind === 'request' && row.key === activeKey}
            dirty={row.kind === 'request' && dirty.has(row.id)}
            renaming={renamingId === row.key}
            menuOpen={menuKey === row.key}
            actions={actionsFor(row)}
            onMenuOpenChange={(o) => setMenuKey(o ? row.key : null)}
            onActivate={() => {
              setFocusKey(row.key)
              if (row.kind === 'request') open(row)
              else setOpen(row.key, !row.expanded)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              focusRow(row.key)
              setMenuKey(row.key)
            }}
            onFocus={() => setFocusKey(row.key)}
            onRenameCommit={(name) => commitRename(row, name)}
            onRenameCancel={(reason) => {
              if (reason === 'esc') refocus.current = row.key
              onRenamingChange(null)
            }}
          />
        ))}
      </div>
      <ConfirmDeleteDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
