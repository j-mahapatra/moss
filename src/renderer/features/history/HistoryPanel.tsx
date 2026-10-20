import { useEffect, useMemo, useRef, useState } from 'react'
import { filterHistory, groupByDay } from '../../../shared/history'
import type { HistoryEntry } from '../../../shared/types'
import { useWorkspace } from '../../state/workspace-hooks'
import { Button, Dialog, IconButton, Input } from '../../ui'
import { TrashIcon } from '../shell/icons'
import { focusAfterRemove } from '../shell/row-helpers'
import { HistoryRow, type HistoryRowActions } from './HistoryRow'
import './HistoryPanel.css'

export function HistoryPanel(): React.JSX.Element {
  const history = useWorkspace((s) => s.history)
  const loaded = useWorkspace((s) => s.loaded)
  const open = useWorkspace((s) => s.openHistoryEntry)
  const remove = useWorkspace((s) => s.deleteHistoryEntry)
  const clear = useWorkspace((s) => s.clearHistory)
  const openSaveDialog = useWorkspace((s) => s.openSaveDialog)

  const [query, setQuery] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const cleared = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  // Re-render at the next local midnight so day labels (Today/Yesterday) stay right.
  const [dayTick, setDayTick] = useState(0)
  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(() => setDayTick((n) => n + 1), midnight.getTime() - now.getTime())
    return () => clearTimeout(timer)
  }, [dayTick])

  const filtered = useMemo(() => filterHistory(history, query), [history, query])
  const groups = groupByDay(filtered, new Date())

  const rowEl = (id: string): HTMLElement | null =>
    listRef.current?.querySelector<HTMLElement>(`[data-history-id="${id}"]`) ?? null
  const focusRow = (id: string): void => rowEl(id)?.focus()

  const removeEntry = (id: string): void => {
    const list = filtered.map((e) => rowEl(e.id)).filter((el) => el !== null)
    const at = list.findIndex((el) => el.dataset.historyId === id)
    void remove(id).then((deleted) => {
      if (!deleted) focusRow(id)
      else focusAfterRemove(list, at, filterRef.current)
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
