import { useEffect, useRef, useState } from 'react'
import type { Environment } from '../../../shared/types'
import { byName } from '../../state/slices/collections'
import { useWorkspace } from '../../state/workspace-hooks'
import { Badge, Button, IconButton, Menu } from '../../ui'
import { ConfirmDeleteDialog, type DeleteTarget } from '../collections/ConfirmDeleteDialog'
import { RenameInput } from '../collections/RenameInput'
import { MoreIcon, PlusIcon } from '../shell/icons'
import { EnvironmentDialog } from './EnvironmentDialog'
import './EnvironmentsPanel.css'

type RowActions = {
  toggleActive(): void
  edit(): void
  rename(): void
  duplicate(): void
  remove(): void
}

function EnvironmentMenu({
  env,
  active,
  open,
  onOpenChange,
  actions
}: {
  env: Environment
  active: boolean
  open: boolean
  onOpenChange(open: boolean): void
  actions: RowActions
}): React.JSX.Element {
  // Actions run once the menu has fully closed, so dialogs and inputs don't fight its teardown.
  const [pending, setPending] = useState<{ fn: () => void; moves: boolean } | null>(null)
  const wrap =
    (fn: () => void, moves = false) =>
    (): void =>
      setPending({ fn, moves })
  return (
    <Menu
      aria-label={`Actions for ${env.name}`}
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={(e) => {
        const next = pending
        setPending(null)
        if (next?.moves) e.preventDefault()
        next?.fn()
      }}
      items={[
        { label: active ? 'Deactivate' : 'Set active', onSelect: wrap(actions.toggleActive) },
        { label: 'Edit variables…', onSelect: wrap(actions.edit) },
        { separator: true },
        { label: 'Rename', onSelect: wrap(actions.rename, true) },
        { label: 'Duplicate', onSelect: wrap(actions.duplicate) },
        { separator: true },
        { label: 'Delete', onSelect: wrap(actions.remove), tone: 'danger' }
      ]}
      trigger={
        <IconButton
          label="More actions"
          aria-haspopup="menu"
          tabIndex={-1}
          className="env-row__more"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreIcon />
        </IconButton>
      }
    />
  )
}

export function EnvironmentsPanel(): React.JSX.Element {
  const loaded = useWorkspace((s) => s.loaded)
  const environments = useWorkspace((s) => s.environments)
  const activeId = useWorkspace((s) => s.activeEnvironmentId)
  const create = useWorkspace((s) => s.createEnvironment)
  const update = useWorkspace((s) => s.updateEnvironment)
  const remove = useWorkspace((s) => s.deleteEnvironment)
  const duplicate = useWorkspace((s) => s.duplicateEnvironmentById)
  const setActive = useWorkspace((s) => s.setActiveEnvironment)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const newRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef<string | null>(null)

  const sorted = [...environments].sort(byName)

  const focusRow = (id: string): void =>
    listRef.current?.querySelector<HTMLElement>(`[data-env-id="${id}"]`)?.focus()

  // Return focus to the row once its inline rename input has unmounted.
  useEffect(() => {
    if (renamingId === null && refocus.current) {
      const id = refocus.current
      refocus.current = null
      focusRow(id)
    }
  })

  const add = (): void => {
    void create('New environment').then((e) => {
      if (e) setRenamingId(e.id)
    })
  }

  const commitRename = (env: Environment, name: string): void => {
    refocus.current = env.id
    setRenamingId(null)
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === env.name) return
    void update(env.id, (e) => (name.trim() ? { ...e, name: name.trim() } : e))
  }

  const confirmDelete = (t: DeleteTarget): void => {
    setDeleteTarget(null)
    const at = sorted.findIndex((e) => e.id === t.id)
    const fallback = sorted[at + 1]?.id ?? sorted[at - 1]?.id ?? null
    void remove(t.id).then((deleted) => {
      if (!deleted) focusRow(t.id)
      else if (fallback) focusRow(fallback)
      else newRef.current?.focus()
    })
  }

  const actionsFor = (env: Environment): RowActions => ({
    toggleActive: () => setActive(env.id === activeId ? null : env.id),
    edit: () => setEditingId(env.id),
    rename: () => setRenamingId(env.id),
    duplicate: () => void duplicate(env.id),
    remove: () =>
      setDeleteTarget({
        kind: 'environment',
        id: env.id,
        name: env.name,
        active: env.id === activeId
      })
  })

  return (
    <aside className="navigator" aria-label="Environments">
      <div className="navigator__header">
        <h2 className="navigator__title">Environments</h2>
        <IconButton ref={newRef} label="New environment" onClick={add}>
          <PlusIcon />
        </IconButton>
      </div>
      <div className="navigator__body">
        {!loaded ? (
          <p className="navigator__quiet">Loading…</p>
        ) : sorted.length === 0 ? (
          <div className="navigator__empty">
            <p className="navigator__quiet">No environments yet</p>
            <Button variant="secondary" size="sm" onClick={add}>
              Create environment
            </Button>
          </div>
        ) : (
          <div ref={listRef} role="list" aria-label="Environments" className="env-list">
            {sorted.map((env) => {
              const isActive = env.id === activeId
              const renaming = renamingId === env.id
              const actions = actionsFor(env)
              return (
                <div
                  key={env.id}
                  role="listitem"
                  aria-label={env.name}
                  tabIndex={0}
                  data-env-id={env.id}
                  className="env-row"
                  onDoubleClick={(e) => {
                    if (renaming || (e.target as Element).closest('button,input')) return
                    actions.edit()
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    focusRow(env.id)
                    setMenuId(env.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey) return
                    if (e.key === 'Enter') actions.edit()
                    else if (e.key === 'F2') actions.rename()
                    else if (e.key === 'Delete' || e.key === 'Backspace') actions.remove()
                    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
                      setMenuId(env.id)
                    else return
                    e.preventDefault()
                  }}
                >
                  {renaming ? (
                    <RenameInput
                      initial={env.name}
                      onCommit={(name) => commitRename(env, name)}
                      onCancel={(reason) => {
                        if (reason === 'esc') refocus.current = env.id
                        setRenamingId(null)
                      }}
                    />
                  ) : (
                    <span className="env-row__name">{env.name}</span>
                  )}
                  {isActive && !renaming && <Badge tone="accent">Active</Badge>}
                  {!renaming && (
                    <EnvironmentMenu
                      env={env}
                      active={isActive}
                      open={menuId === env.id}
                      onOpenChange={(o) => setMenuId(o ? env.id : null)}
                      actions={actions}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <EnvironmentDialog envId={editingId} onClose={() => setEditingId(null)} />
      <ConfirmDeleteDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </aside>
  )
}
