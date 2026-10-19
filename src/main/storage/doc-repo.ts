import { readdir } from 'fs/promises'
import { join } from 'path'
import type { z } from 'zod'
import { atomicWriteJson, defaultFs, type AtomicFs, type WriteQueue } from './atomic-write'
import { readJsonDir } from './json-dir'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ORPHAN_TMP_RE = /^([0-9a-f-]{36}\.json)\.[0-9a-f-]{36}\.tmp$/

export type DocRepoOptions<T> = {
  dataDir: string
  subdir: string
  schema: z.ZodType<T>
  /** Used in the id error: `Invalid ${label} id`. */
  label: string
  queue: WriteQueue
  fsImpl?: AtomicFs
  now?: () => number
}

export class DocRepo<T extends { id: string; name: string }> {
  private cache = new Map<string, T>()
  /** One set per in-flight list(): ids saved or deleted since that list started. */
  private touchTrackers = new Set<Set<string>>()
  private dir: string
  private swept = false
  private schema: z.ZodType<T>
  private label: string
  private queue: WriteQueue
  private fsImpl: AtomicFs
  private now: () => number

  constructor(opts: DocRepoOptions<T>) {
    this.dir = join(opts.dataDir, opts.subdir)
    this.schema = opts.schema
    this.label = opts.label
    this.queue = opts.queue
    this.fsImpl = opts.fsImpl ?? defaultFs
    this.now = opts.now ?? Date.now
  }

  private file(id: string): string {
    if (!ID_RE.test(id)) throw new Error(`Invalid ${this.label} id`)
    return join(this.dir, `${id}.json`)
  }

  private touch(id: string): void {
    for (const t of this.touchTrackers) t.add(id)
  }

  /** Removes atomic-write orphans. Each runs under its target's queue key so in-flight writes are safe. */
  private async sweepTmp(): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return
    }
    for (const name of names) {
      const m = ORPHAN_TMP_RE.exec(name)
      if (!m) continue
      await this.queue.run(join(this.dir, m[1] as string), async () => {
        try {
          await this.fsImpl.unlink(join(this.dir, name))
        } catch {
          // best effort
        }
      })
    }
  }

  async list(): Promise<{ values: T[]; warnings: string[] }> {
    if (!this.swept) {
      this.swept = true
      await this.sweepTmp()
    }
    const touched = new Set<string>()
    this.touchTrackers.add(touched)
    try {
      const { values, warnings } = await readJsonDir(
        this.dir,
        this.schema,
        this.queue,
        this.now,
        this.fsImpl
      )
      const merged = new Map(values.map((c) => [c.id, c]))
      // Anything saved/deleted while we were reading wins over what we read.
      for (const id of touched) {
        const current = this.cache.get(id)
        if (current) merged.set(id, current)
        else merged.delete(id)
      }
      this.cache = merged
      const sorted = [...merged.values()].sort(
        (a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
          a.id.localeCompare(b.id)
      )
      return { values: sorted, warnings }
    } finally {
      this.touchTrackers.delete(touched)
    }
  }

  async get(id: string): Promise<T | null> {
    const lower = id.toLowerCase()
    if (!ID_RE.test(lower)) return null
    const path = this.file(lower)
    // Same queue key as save/delete, so a read waits for a pending write of this doc.
    return this.queue.run(path, async () => {
      const cached = this.cache.get(lower)
      if (cached) return cached
      try {
        const r = this.schema.safeParse(JSON.parse(await this.fsImpl.readFile(path, 'utf8')))
        return r.success && r.data.id === lower ? r.data : null
      } catch {
        return null
      }
    })
  }

  async save(doc: T): Promise<void> {
    const lower = doc.id.toLowerCase()
    const path = this.file(lower)
    const valid = this.schema.parse({ ...doc, id: lower })
    await this.queue.run(path, async () => {
      await atomicWriteJson(path, valid, this.fsImpl)
      this.cache.set(lower, valid)
      this.touch(lower)
    })
  }

  async delete(id: string): Promise<void> {
    const lower = id.toLowerCase()
    const path = this.file(lower)
    await this.queue.run(path, async () => {
      try {
        await this.fsImpl.unlink(path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
      this.cache.delete(lower)
      this.touch(lower)
    })
  }
}
