import { HISTORY_CAP } from '../../../shared/history'
import type { HistoryEntry } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import { afterInit, errorMessage, type SliceCtx } from './ctx'
import type { AddNotice } from './notices'

/**
 * Merges `front` (newest first) ahead of `rest`, dropping later duplicates by id, capped at
 * HISTORY_CAP. Used for prepends and for merging a load or a rollback with entries that a
 * send added meanwhile.
 */
export function mergeHistory(front: HistoryEntry[], rest: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>()
  const out: HistoryEntry[] = []
  for (const e of [...front, ...rest]) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push(e)
    if (out.length === HISTORY_CAP) break
  }
  return out
}

/** Runs an api call so a synchronous throw becomes a rejection (R8). */
const attempt = (fn: () => Promise<void>): Promise<void> => Promise.resolve().then(fn)

export function createHistory(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice
): {
  /** Prepends an entry a send recorded (dedupe by id, cap). */
  prepend(entry: HistoryEntry): void
  /** Applies a loaded list, keeping entries that sends prepended while it loaded. */
  applyLoaded(entries: HistoryEntry[]): void
  slice: Pick<WorkspaceState, 'history' | 'deleteHistoryEntry' | 'clearHistory'>
} {
  /** Bumped by every successful clear: a rollback that started before it must not resurrect. */
  let clearedEpoch = 0

  return {
    prepend: (entry) => set((s) => ({ history: mergeHistory([entry], s.history) })),
    applyLoaded: (entries) => set((s) => ({ history: mergeHistory(s.history, entries) })),
    slice: {
      history: [],

      deleteHistoryEntry: afterInit(get, async (id: string) => {
        const before = get().history
        const index = before.findIndex((e) => e.id === id)
        const target = before[index]
        if (!target) return false
        const successors = new Set(before.slice(index + 1).map((e) => e.id))
        const epoch = clearedEpoch
        set((s) => ({ history: s.history.filter((e) => e.id !== id) }))
        try {
          await attempt(() => api['history:delete']({ id }))
          return true
        } catch (err) {
          if (epoch === clearedEpoch) {
            set((s) => {
              if (s.history.some((e) => e.id === id)) return s
              // Re-insert before the first surviving original successor, so entries a send
              // prepended meanwhile stay in front and nothing else moves.
              const at = s.history.findIndex((e) => successors.has(e.id))
              const next = [...s.history]
              next.splice(at === -1 ? next.length : at, 0, target)
              return { history: next.slice(0, HISTORY_CAP) }
            })
          }
          addNotice('danger', `Couldn't delete the history entry: ${errorMessage(err)}`)
          return false
        }
      }),

      clearHistory: afterInit(get, async () => {
        const before = get().history
        set({ history: [] })
        try {
          await attempt(() => api['history:clear']())
          clearedEpoch++
          return true
        } catch (err) {
          // Entries prepended during the clear are newer than everything it removed.
          set((s) => ({ history: mergeHistory(s.history, before) }))
          addNotice('danger', `Couldn't clear history: ${errorMessage(err)}`)
          return false
        }
      })
    }
  }
}
