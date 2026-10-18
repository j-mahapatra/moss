import { join } from 'path'
import { CollectionSchema } from '../../shared/schemas'
import type { Collection } from '../../shared/types'
import { atomicWriteJson, defaultFs, WriteQueue, type AtomicFs } from './atomic-write'
import { readJsonDir } from './json-dir'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CollectionsRepo {
  private cache = new Map<string, Collection>()
  /** One set per in-flight list(): ids saved or deleted since that list started. */
  private touchTrackers = new Set<Set<string>>()
  private dir: string

  constructor(
    dataDir: string,
    private queue: WriteQueue = new WriteQueue(),
    private fsImpl: AtomicFs = defaultFs,
    private now: () => number = Date.now
  ) {
    this.dir = join(dataDir, 'collections')
  }

  private file(id: string): string {
    if (!ID_RE.test(id)) throw new Error('Invalid collection id')
    return join(this.dir, `${id}.json`)
  }

  private touch(id: string): void {
    for (const t of this.touchTrackers) t.add(id)
  }

  async list(): Promise<{ collections: Collection[]; warnings: string[] }> {
    const touched = new Set<string>()
    this.touchTrackers.add(touched)
    try {
      const { values, warnings } = await readJsonDir(
        this.dir,
        CollectionSchema,
        this.now,
        this.queue,
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
      const collections = [...merged.values()].sort(
        (a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
          a.id.localeCompare(b.id)
      )
      return { collections, warnings }
    } finally {
      this.touchTrackers.delete(touched)
    }
  }

  async get(id: string): Promise<Collection | null> {
    if (!ID_RE.test(id)) return null
    const cached = this.cache.get(id)
    if (cached) return cached
    try {
      const r = CollectionSchema.safeParse(
        JSON.parse(await this.fsImpl.readFile(this.file(id), 'utf8'))
      )
      return r.success && r.data.id === id ? r.data : null
    } catch {
      return null
    }
  }

  async save(c: Collection): Promise<void> {
    const path = this.file(c.id)
    const valid = CollectionSchema.parse(c)
    await this.queue.run(path, async () => {
      await atomicWriteJson(path, valid, this.fsImpl)
      this.cache.set(valid.id, valid)
      this.touch(valid.id)
    })
  }

  async delete(id: string): Promise<void> {
    const path = this.file(id)
    await this.queue.run(path, async () => {
      try {
        await this.fsImpl.unlink(path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
      this.cache.delete(id)
      this.touch(id)
    })
  }
}
