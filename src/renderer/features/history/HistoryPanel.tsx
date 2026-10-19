import { useMemo, useRef, useState } from 'react'
import { filterHistory, groupByDay } from '../../../shared/history'
import type { HistoryEntry } from '../../../shared/types'
import { useWorkspace } from '../../state/workspace-hooks'
import { Button, Dialog, IconButton, Input } from '../../ui'
import { TrashIcon } from '../shell/icons'
import { HistoryRow, type HistoryRowActions } from './HistoryRow'
import './HistoryPanel.css'

export function HistoryPanel(): React.JSX.Element {
  const history = useWorkspace((s) => s.history)
  const loaded = useWorkspace((s) => s.loaded)
  const openEntry = useWorkspace((s) => s.openHistoryEntry)
  const remove = useWorkspace((s) => s.deleteHistoryEntry)
  const clear = useWorkspace((s) => s.clearHistory)
  const setConfirmDiscard = useWorkspace((s) => s.setConfirmDiscard)
  const openSaveDialog = useWorkspace((s) => s.openSaveDialog)

  const [query, setQuery] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const cleared = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => filterHistory(history, query), [history, query])
  const groups = groupByDay(filtered, new Date())

  const focusRow = (id: string): void =>
    listRef.current?.querySelector<HTMLElement>(`[data-history-id="${id}"]`)?.focus()

  const open = (id: string): 'opened' | 'confirm-discard' => {
    const outcome = openEntry(id)
    if (outcome === 'confirm-discard') setConfirmDiscard({ then: 'history', id })
    return outcome
  }

  const removeEntry = (id: string): void => {
    const at = filtered.findIndex((e) => e.id === id)
    const fallback = filtered[at + 1]?.id ?? filtered[at - 1]?.id ?? null
    void remove(id).then((deleted) => {
      if (!deleted) focusRow(id)
      else if (fallback) focusRow(fallback)
      else filterRef.current?.focus()
    })
  }

  const actionsFor = (e: HistoryEntry): HistoryRowActions => ({
    open: () => void open(e.id),
    saveToCollection: () => {
      if (open(e.id) === 'opened') openSaveDialog(true)
    },
    remove: () => removeEntry(e.id)
  })

  const confirmClearHistory = (): void => {
    void clear().then((ok) => {
      if (!ok) return
      cleared.current = true
      setConfirmClear(false)
    })
  }

  return (
    <aside className="navigator" aria-label="History">
      <div className="navigator__header">
        <h2 className="navigator__title">History</h2>
        <IconButton
          label="Clear history"
          disabled={history.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          <TrashIcon />
        </IconButton>
      </div>
      <div className="history-filter">
        <Input
          ref={filterRef}
          aria-label="Filter history"
          placeholder="Filter history"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="navigator__body">
        {!loaded ? (
          <p className="navigator__quiet">Loading…</p>
        ) : history.length === 0 ? (
          <p className="navigator__quiet">No requests yet</p>
        ) : filtered.length === 0 ? (
          <p className="navigator__quiet">No matches</p>
        ) : (
          <div ref={listRef}>
            {groups.map((g) => (
              <section key={g.key} className="history-group">
                <h3 className="history-group__label">{g.label}</h3>
                <div role="list" aria-label={g.label} className="history-list">
                  {g.entries.map((e) => (
                    <HistoryRow
                      key={e.id}
                      entry={e}
                      menuOpen={menuId === e.id}
                      onMenuOpenChange={(o) => setMenuId(o ? e.id : null)}
                      actions={actionsFor(e)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        onCloseAutoFocus={(e) => {
          // The Clear button is disabled once history is empty, so focus the filter instead.
          if (!cleared.current) return
          cleared.current = false
          e.preventDefault()
          filterRef.current?.focus()
        }}
        title="Clear history?"
        description="This removes every entry. It can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmClearHistory}>
              Clear
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </aside>
  )
}
