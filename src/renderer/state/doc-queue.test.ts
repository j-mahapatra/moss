/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers with inferred types */
import { describe, expect, it, vi } from 'vitest'
import { createDocQueue } from './slices/doc-queue'

type Doc = { id: string; name: string; n: number }
type Held = { doc?: Doc; id?: string; resolve(): void; reject(e: unknown): void }

function setup(initial: Doc[]) {
  let docs = [...initial]
  const disk = new Map(initial.map((d) => [d.id, d]))
  const held: Held[] = []
  const hold = <T extends Omit<Held, 'resolve' | 'reject'>>(meta: T, onOk: () => void) =>
    new Promise<void>((resolve, reject) =>
      held.push({
        ...meta,
        resolve: () => {
          onOk()
          resolve()
        },
        reject
      })
    )
  const save = vi.fn((doc: Doc) => hold({ doc }, () => disk.set(doc.id, doc)))
  const remove = vi.fn((id: string) => hold({ id }, () => disk.delete(id)))
  const onSaveError = vi.fn()
  const onDeleteError = vi.fn()
  const onConfirmed = vi.fn()
  const q = createDocQueue<Doc>({
    read: () => docs,
    write: (d) => {
      docs = d
    },
    save,
    remove,
    onSaveError,
    onDeleteError,
    onConfirmed
  })
  return { q, docs: () => docs, disk, held, save, remove, onSaveError, onDeleteError, onConfirmed }
}

const a: Doc = { id: 'a', name: 'A', n: 0 }
const b: Doc = { id: 'b', name: 'B', n: 0 }
const bump = (d: Doc): Doc => ({ ...d, n: d.n + 1 })

describe('doc queue delete fence', () => {
  it('an update queued after delete resolves false and never saves', async () => {
    const t = setup([a, b])
    const del = t.q.delete('a')
    const late = t.q.update('a', bump)
    expect(await late).toBe(false)
    await vi.waitFor(() => expect(t.held).toHaveLength(1))
    t.held[0]!.resolve()
    expect(await del).toBe(true)
    expect(t.save).not.toHaveBeenCalled()
    expect(t.docs().map((d) => d.id)).toEqual(['b'])
    expect(t.disk.has('a')).toBe(false)
    expect(t.onConfirmed).toHaveBeenCalled()
  })

  it('an update queued before delete saves first, then the delete runs', async () => {
    const t = setup([a])
    const early = t.q.update('a', bump)
    const del = t.q.delete('a')
    const late = t.q.update('a', bump)
    expect(await late).toBe(false)
    await vi.waitFor(() => expect(t.held).toHaveLength(1))
    expect(t.held[0]!.doc?.n).toBe(1)
    expect(t.remove).not.toHaveBeenCalled()
    t.held[0]!.resolve()
    expect(await early).toBe(true)
    await vi.waitFor(() => expect(t.held).toHaveLength(2))
    expect(t.held[1]!.id).toBe('a')
    t.held[1]!.resolve()
    expect(await del).toBe(true)
    expect(t.save).toHaveBeenCalledTimes(1)
    expect(t.docs()).toEqual([])
  })

  it('a failed delete clears the fence, keeps the doc and reports', async () => {
    const t = setup([a])
    const del = t.q.delete('a')
    await vi.waitFor(() => expect(t.held).toHaveLength(1))
    t.held[0]!.reject(new Error('locked'))
    expect(await del).toBe(false)
    expect(t.docs()).toEqual([a])
    expect(t.onDeleteError).toHaveBeenCalledWith(a, expect.any(Error))
    const p = t.q.update('a', bump)
    await vi.waitFor(() => expect(t.held).toHaveLength(2))
    t.held[1]!.resolve()
    expect(await p).toBe(true)
  })

  it('update and delete of a missing doc resolve false with no callbacks', async () => {
    const t = setup([])
    expect(await t.q.update('x', bump)).toBe(false)
    expect(await t.q.delete('x')).toBe(false)
    expect(t.save).not.toHaveBeenCalled()
    expect(t.remove).not.toHaveBeenCalled()
    expect(t.onSaveError).not.toHaveBeenCalled()
  })
})

describe('doc queue create', () => {
  it('inserts sorted at once, confirms on save', async () => {
    const t = setup([b])
    const p = t.q.create({ id: 'c', name: 'a-first', n: 0 })
    expect(t.docs().map((d) => d.id)).toEqual(['c', 'b'])
    expect(t.q.confirmed('c')).toBeUndefined()
    await vi.waitFor(() => expect(t.held).toHaveLength(1))
    t.held[0]!.resolve()
    expect(await p).toBe(true)
    expect(t.q.confirmed('c')?.id).toBe('c')
  })

  it('removes the doc and reports on failure; updates queued behind it resolve false', async () => {
    const t = setup([])
    const p = t.q.create(a)
    const u = t.q.update('a', bump)
    await vi.waitFor(() => expect(t.held).toHaveLength(1))
    t.held[0]!.reject(new Error('full'))
    expect(await p).toBe(false)
    expect(await u).toBe(false)
    expect(t.docs()).toEqual([])
    expect(t.save).toHaveBeenCalledTimes(1)
    expect(t.onSaveError).toHaveBeenCalledWith(a, expect.any(Error), 'create')
  })

  it('an update made while the create is pending saves after it', async () => {
    const t = setup([])
    const p = t.q.create(a)
    const u = t.q.update('a', bump)
    expect(t.docs()[0]!.n).toBe(1)
    await vi.waitFor(() => expect(t.held).toHaveLength(1))
    await Promise.resolve()
    expect(t.save).toHaveBeenCalledTimes(1)
    t.held[0]!.resolve()
    await vi.waitFor(() => expect(t.held).toHaveLength(2))
    t.held[1]!.resolve()
    expect(await Promise.all([p, u])).toEqual([true, true])
    expect(t.disk.get('a')?.n).toBe(1)
  })
})
