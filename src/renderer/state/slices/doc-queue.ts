type Named = { id: string; name: string }

export const byName = (a: Named, b: Named): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)

export type DocQueue<T> = {
  update(id: string, fn: (d: T) => T): Promise<boolean>
  create(doc: T): Promise<boolean>
  delete(id: string): Promise<boolean>
  /** Last version known to be on disk; undefined if never saved through this queue. */
  confirmed(id: string): T | undefined
}

export type DocQueueOpts<T> = {
  read: () => T[]
  write: (docs: T[]) => void
  save: (doc: T) => Promise<void>
  remove: (id: string) => Promise<void>
  onSaveError: (doc: T, err: unknown, kind: 'create' | 'update') => void
  onDeleteError: (doc: T, err: unknown) => void
  /** Runs after every settled save/delete (success or rollback), against confirmed state. */
  onConfirmed: () => void
}

/**
 * Per-doc optimistic save queue. `confirmed` is the last version known to be on disk;
 * `pending` are the ops applied optimistically but not yet saved. Saves for one doc run
 * strictly one after another (`tail`). Each save writes the op's precomputed result. If it
 * fails, that op is dropped and the visible doc is recomputed as confirmed + the remaining
 * pending ops, so only the failed change rolls back.
 *
 * `fn` runs exactly once per update (against the optimistic state, when enqueued) and that
 * result is what gets saved, so ids it generates match between state and disk. Only after
 * an earlier op has failed are the later ops re-folded over the confirmed state, so `fn`
 * may then run again.
 *
 * `delete` fences the doc at once: ops enqueued after it resolve false without saving, while
 * ops queued before it finish first. A failed create marks the entry dead, so ops queued
 * behind it resolve false without saving.
 */
type Op<T> = { fn: (d: T) => T; result: T }
type Entry<T> = { confirmed: T | null; pending: Op<T>[]; tail: Promise<unknown>; dead: boolean }

/** Recomputes each pending op's result over `base`, in order (only used after a failure). */
function refold<T>(base: T, pending: Op<T>[]): T {
  let cur = base
  for (const op of pending) {
    op.result = op.fn(cur)
    cur = op.result
  }
  return cur
}

export function createDocQueue<T extends Named>(opts: DocQueueOpts<T>): DocQueue<T> {
  const entries = new Map<string, Entry<T>>()
  const fenced = new Set<string>()

  const find = (id: string): T | undefined => opts.read().find((d) => d.id === id)
  const put = (doc: T): void =>
    opts.write([...opts.read().filter((d) => d.id !== doc.id), doc].sort(byName))
  const drop = (id: string): void => opts.write(opts.read().filter((d) => d.id !== id))

  const enqueue = (e: Entry<T>, run: () => Promise<boolean>): Promise<boolean> => {
    const result = e.tail.then(run)
    e.tail = result
    return result
  }

  return {
    confirmed: (id) => entries.get(id)?.confirmed ?? undefined,

    update: (id, fn) => {
      if (fenced.has(id)) return Promise.resolve(false)
      const current = find(id)
      if (!current) return Promise.resolve(false)
      const next = fn(current)
      if (next === current) return Promise.resolve(true)

      let e = entries.get(id)
      if (!e) {
        e = { confirmed: current, pending: [], tail: Promise.resolve(), dead: false }
        entries.set(id, e)
      } else if (e.pending.length === 0) {
        e.confirmed = current
      }
      const entry = e
      const op: Op<T> = { fn, result: next }
      entry.pending.push(op)
      put(next)

      return enqueue(entry, async () => {
        // pending[0] is always this op: ops run FIFO.
        if (entry.dead) {
          entry.pending.shift()
          return false
        }
        const toSave = op.result
        try {
          await opts.save(toSave)
        } catch (err) {
          entry.pending.shift()
          // Non-null: a live entry's earlier ops (incl. its create) have all confirmed.
          put(refold(entry.confirmed!, entry.pending))
          opts.onConfirmed()
          opts.onSaveError(current, err, 'update')
          return false
        }
        entry.confirmed = toSave
        entry.pending.shift()
        opts.onConfirmed()
        return true
      })
    },

    create: (doc) => {
      const entry: Entry<T> = {
        confirmed: null,
        pending: [{ fn: () => doc, result: doc }],
        tail: Promise.resolve(),
        dead: false
      }
      entries.set(doc.id, entry)
      put(doc)
      return enqueue(entry, async () => {
        try {
          await opts.save(doc)
        } catch (err) {
          entry.dead = true
          entry.pending.shift()
          if (entries.get(doc.id) === entry) entries.delete(doc.id)
          drop(doc.id)
          opts.onConfirmed()
          opts.onSaveError(doc, err, 'create')
          return false
        }
        entry.confirmed = doc
        entry.pending.shift()
        opts.onConfirmed()
        return true
      })
    },

    delete: async (id) => {
      const target = find(id)
      if (!target || fenced.has(id)) return false
      fenced.add(id)
      try {
        await entries.get(id)?.tail // ops queued before the fence land first
        if (!find(id)) return true // its create failed meanwhile: already gone
        try {
          await opts.remove(id)
        } catch (err) {
          opts.onDeleteError(target, err)
          return false
        }
        entries.delete(id)
        drop(id)
        opts.onConfirmed()
        return true
      } finally {
        fenced.delete(id)
      }
    }
  }
}
