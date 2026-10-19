import { join } from 'path'
import { HISTORY_CAP } from '../../shared/history'
import { HistoryEntrySchema } from '../../shared/schemas'
import type { HistoryEntry } from '../../shared/types'
import { atomicWriteText, defaultFs, type AtomicFs, type WriteQueue } from './atomic-write'
import { dirname } from 'path'

const encode = (entries: HistoryEntry[]): string =>
  entries.map((e) => JSON.stringify(e) + '\n').join('')

/** Append-only `history.jsonl`; the cache holds entries oldest-first (file order). */
export class HistoryRepo {
  private cache: HistoryEntry[] | null = null
  private lineCount = 0
  private pendingWarnings: string[] = []

  constructor(
    private dataDir: string,
    private queue: WriteQueue,
    private fsImpl: AtomicFs = defaultFs,
    private now: () => number = Date.now
  ) {}

  private get path(): string {
    return join(this.dataDir, 'history.jsonl')
  }

  /** Must run inside the file's queue slot. Loads, quarantines and compacts once. */
  private async ensureLoaded(): Promise<HistoryEntry[]> {
    if (this.cache) return this.cache
    let raw = ''
    try {
      raw = await this.fsImpl.readFile(this.path, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    const parts = raw.split('\n')
    if (parts[parts.length - 1] === '') parts.pop()
    const valid: HistoryEntry[] = []
    const invalid: string[] = []
    for (const line of parts) {
      if (line === '') continue
      try {
        const r = HistoryEntrySchema.safeParse(JSON.parse(line))
        if (r.success) valid.push(r.data)
        else invalid.push(line)
      } catch {
        invalid.push(line)
      }
    }
    const kept = valid.slice(-HISTORY_CAP)
    const warnings: string[] = []
    if (invalid.length > 0) {
      const name = `history.corrupt-${this.now()}.jsonl`
      await atomicWriteText(join(this.dataDir, name), invalid.join('\n') + '\n', this.fsImpl)
      warnings.push(`Some history entries couldn't be read and were moved to "${name}".`)
    }
    if (invalid.length > 0 || kept.length < valid.length) {
      await atomicWriteText(this.path, encode(kept), this.fsImpl)
    }
    this.cache = kept
    this.lineCount = kept.length
    this.pendingWarnings.push(...warnings)
    return kept
  }

  async list(): Promise<{ entries: HistoryEntry[]; warnings: string[] }> {
    return this.queue.run(this.path, async () => {
      const cache = await this.ensureLoaded()
      const warnings = this.pendingWarnings
      this.pendingWarnings = []
      return { entries: cache.slice(-HISTORY_CAP).reverse(), warnings }
    })
  }

  async append(e: HistoryEntry): Promise<void> {
    const entry = HistoryEntrySchema.parse(e)
    await this.queue.run(this.path, async () => {
      const cache = await this.ensureLoaded()
      await this.fsImpl.mkdir(dirname(this.path), { recursive: true })
      await this.fsImpl.appendFile(this.path, JSON.stringify(entry) + '\n', 'utf8')
      cache.push(entry)
      this.lineCount++
      if (this.lineCount > 2 * HISTORY_CAP) {
        const trimmed = cache.slice(-HISTORY_CAP)
        try {
          await atomicWriteText(this.path, encode(trimmed), this.fsImpl)
          this.cache = trimmed
          this.lineCount = trimmed.length
        } catch {
          // the append itself succeeded; compaction retries on the next append
        }
      }
    })
  }

  async delete(id: string): Promise<void> {
    await this.queue.run(this.path, async () => {
      const cache = await this.ensureLoaded()
      if (!cache.some((e) => e.id === id)) return
      const next = cache.filter((e) => e.id !== id)
      await atomicWriteText(this.path, encode(next), this.fsImpl)
      this.cache = next
      this.lineCount = next.length
    })
  }

  async clear(): Promise<void> {
    await this.queue.run(this.path, async () => {
      await this.ensureLoaded()
      await atomicWriteText(this.path, '', this.fsImpl)
      this.cache = []
      this.lineCount = 0
    })
  }
}
