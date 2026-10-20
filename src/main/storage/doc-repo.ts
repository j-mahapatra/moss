import { readdir } from 'fs/promises'
import { join } from 'path'
import type { z } from 'zod'
import { atomicWriteJson, defaultFs, type AtomicFs, type WriteQueue } from './atomic-write'
import { readJsonDir } from './json-dir'
import { onceSwept, UUID_PATTERN } from './tmp-sweep'
import { decryptWarning, type Opened } from '../secrets/secret-codec'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ORPHAN_TMP_RE = new RegExp(`^(${UUID_PATTERN}\\.json)\\.${UUID_PATTERN}\\.tmp$`)

/** Seals secret fields for disk and opens them on load (see SecretCodec). */
export type DocCodec<T> = {
  available(): boolean
  /** Seals plaintext input; every non-empty secret is sealed. */
  seal(doc: T): T
  /** Re-seals a stored doc, leaving already-sealed values as they are. */
  reseal(doc: T): T
  open(doc: T): Opened<T>
}

const identityCodec: DocCodec<never> = {
  available: () => false,
  seal: (doc) => doc,
  reseal: (doc) => doc,
  open: (doc) => ({ value: doc, failed: 0, plaintext: false })
}

export type DocRepoOptions<T> = {
  dataDir: string
  subdir: string
  schema: z.ZodType<T>
  /** Used in the id error: `Invalid ${label} id`. */
  label: string
  queue: WriteQueue
  fsImpl?: AtomicFs
  now?: () => number
  codec?: DocCodec<T>
}

export class DocRepo<T extends { id: string; name: string }> {
  private cache = new Map<string, T>()
  /** One set per in-flight list(): ids saved or deleted since that list started. */
  private touchTrackers = new Set<Set<string>>()
  private dir: string
  private sweepOnce = onceSwept(() => this.sweepTmp())
  private schema: z.ZodType<T>
  private label: string
  private queue: WriteQueue
  private fsImpl: AtomicFs
  private now: () => number
  private codec: DocCodec<T>

  constructor(opts: DocRepoOptions<T>) {
    this.dir = join(opts.dataDir, opts.subdir)
    this.schema = opts.schema
    this.label = opts.label
    this.queue = opts.queue
    this.fsImpl = opts.fsImpl ?? defaultFs
    this.now = opts.now ?? Date.now
    this.codec = opts.codec ?? (identityCodec as DocCodec<T>)
  }

  /**
   * Opens a stored doc. Must run inside its queue slot. A doc holding plaintext secrets is
   * rewritten sealed; values that won't decrypt keep their stored bytes until the next save.
   */
  private async load(stored: T, path: string): Promise<Opened<T>> {
    const opened = this.codec.open(stored)
    if (opened.plaintext && this.codec.available()) {
      try {
        await atomicWriteJson(path, this.codec.reseal(stored), this.fsImpl)
      } catch {
        // best effort (a failed seal or write); migration retries on the next load
      }
    }
    return opened
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
    await this.sweepOnce()
    const touched = new Set<string>()
    this.touchTrackers.add(touched)
    try {
      let failed = 0
      const { values, warnings } = await readJsonDir(
        this.dir,
        this.schema,
        this.queue,
        this.now,
        this.fsImpl,
        async (doc, path) => {
          const opened = await this.load(doc, path)
          failed += opened.failed
          return opened.value
        }
      )
      if (failed > 0) warnings.push(decryptWarning(failed))
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
        if (!r.success || r.data.id !== lower) return null
        return (await this.load(r.data, path)).value
      } catch {
        return null
      }
    })
  }

  async save(doc: T): Promise<void> {
    const lower = doc.id.toLowerCase()
    const path = this.file(lower)
    const valid = this.schema.parse({ ...doc, id: lower })
    const sealed = this.codec.seal(valid)
    await this.queue.run(path, async () => {
      await atomicWriteJson(path, sealed, this.fsImpl)
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
