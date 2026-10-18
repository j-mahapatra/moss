import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { CollectionSchema } from '../../shared/schemas'
import type { Collection } from '../../shared/types'
import { atomicWriteJson, defaultFs, WriteQueue, type AtomicFs } from './atomic-write'
import { readJsonDir } from './json-dir'

export class CollectionsRepo {
  private cache = new Map<string, Collection>()
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
    return join(this.dir, `${id}.json`)
  }

  async list(): Promise<{ collections: Collection[]; warnings: string[] }> {
    const { values, warnings } = await readJsonDir(this.dir, CollectionSchema, this.now)
    this.cache = new Map(values.map((c) => [c.id, c]))
    const collections = [...values].sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)
    )
    return { collections, warnings }
  }

  async get(id: string): Promise<Collection | null> {
    const cached = this.cache.get(id)
    if (cached) return cached
    try {
      const r = CollectionSchema.safeParse(JSON.parse(await readFile(this.file(id), 'utf8')))
      return r.success && r.data.id === id ? r.data : null
    } catch {
      return null
    }
  }

  async save(c: Collection): Promise<void> {
    const path = this.file(c.id)
    await this.queue.run(path, async () => {
      await atomicWriteJson(path, c, this.fsImpl)
      this.cache.set(c.id, c)
    })
  }

  async delete(id: string): Promise<void> {
    const path = this.file(id)
    await this.queue.run(path, async () => {
      try {
        await unlink(path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
      this.cache.delete(id)
    })
  }
}
