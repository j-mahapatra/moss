import { dirname, join } from 'path'
import { HISTORY_CAP } from '../../shared/history'
import { HistoryEntrySchema } from '../../shared/schemas'
import type { HistoryEntry } from '../../shared/types'
import { sweepTmp } from './tmp-sweep'
import { atomicWriteText, defaultFs, type AtomicFs, type WriteQueue } from './atomic-write'
import {
  decryptWarning,
  plainCodec,
  type SealOptions,
  type SecretCodec
} from '../secrets/secret-codec'

/** `stored` is the line as written (secrets sealed); `open` is what callers see. */
type Cached = { stored: HistoryEntry; open: HistoryEntry }

const encode = (entries: Cached[]): string =>
  entries.map((e) => JSON.stringify(e.stored) + '\n').join('')

/** Append-only `history.jsonl`; the cache holds entries oldest-first (file order). */
export class HistoryRepo {
  private cache: Cached[] | null = null
  private lineCount = 0
  private pendingWarnings: string[] = []
  private swept = false

  constructor(
    private dataDir: string,
    private queue: WriteQueue,
    private fsImpl: AtomicFs = defaultFs,
    private now: () => number = Date.now,
    private codec: SecretCodec = plainCodec
  ) {}

  private seal(e: HistoryEntry, opts?: SealOptions): HistoryEntry {
    return { ...e, request: this.codec.sealRequest(e.request, opts) }
  }

  private get path(): string {
    return join(this.dataDir, 'history.jsonl')
  }

  /** Must run inside the file's queue slot. Loads, quarantines and compacts once. */
  private async ensureLoaded(): Promise<Cached[]> {
    if (this.cache) return this.cache
    if (!this.swept) {
      this.swept = true
      await sweepTmp(this.dataDir, 'history.jsonl', this.fsImpl.unlink)
    }
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
    let failed = 0
    let plaintext = false
    let kept = valid.slice(-HISTORY_CAP).map((stored): Cached => {
      const opened = this.codec.openRequest(stored.request)
      failed += opened.failed
      plaintext ||= opened.plaintext
      return { stored, open: { ...stored, request: opened.value } }
    })
    let migrate = plaintext && this.codec.available()
    if (migrate) {
      try {
        // keepSealed leaves already-sealed (including undecryptable) values byte-for-byte.
        kept = kept.map((e) => ({ ...e, stored: this.seal(e.stored, { keepSealed: true }) }))
      } catch {
        // Can't seal (e.g. keychain denied): keep the stored lines as they are, skip migration.
        migrate = false
      }
    }
    const warnings: string[] = []
    if (invalid.length > 0) {
      const name = `history.corrupt-${this.now()}.jsonl`
      await atomicWriteText(join(this.dataDir, name), invalid.join('\n') + '\n', this.fsImpl)
      warnings.push(`Some history entries couldn't be read and were moved to "${name}".`)
    }
    if (failed > 0) warnings.push(decryptWarning(failed))
    if (
      migrate ||
      invalid.length > 0 ||
      kept.length < valid.length ||
      (raw !== '' && !raw.endsWith('\n'))
    ) {
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
      const entries = cache.slice(-HISTORY_CAP).map((e) => e.open)
      return { entries: entries.reverse(), warnings }
    })
  }

  async append(e: HistoryEntry): Promise<void> {
    const entry = HistoryEntrySchema.parse(e)
    const stored = this.seal(entry)
    await this.queue.run(this.path, async () => {
      const cache = await this.ensureLoaded()
      await this.fsImpl.mkdir(dirname(this.path), { recursive: true })
      try {
        await this.fsImpl.appendFile(this.path, JSON.stringify(stored) + '\n', 'utf8')
      } catch (err) {
        // A partial write may have left a torn tail; reload (and quarantine) before the next op.
        this.cache = null
        throw err
      }
      cache.push({ stored, open: entry })
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
      if (!cache.some((e) => e.open.id === id)) return
      const next = cache.filter((e) => e.open.id !== id)
      await atomicWriteText(this.path, encode(next), this.fsImpl)
      this.cache = next
      this.lineCount = next.length
    })
  }

  async clear(): Promise<void> {
    await this.queue.run(this.path, async () => {
      await atomicWriteText(this.path, '', this.fsImpl)
      this.cache = []
      this.lineCount = 0
    })
  }
}
