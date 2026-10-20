import { join } from 'path'
import { SettingsSchema } from '../../shared/schemas'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types'
import { atomicWriteJson, defaultFs, WriteQueue, type AtomicFs } from './atomic-write'
import { quarantine } from './json-dir'
import { onceSwept, sweepTmp } from './tmp-sweep'

export class SettingsRepo {
  constructor(
    private dataDir: string,
    private queue: WriteQueue = new WriteQueue(),
    private fsImpl: AtomicFs = defaultFs,
    private now: () => number = Date.now
  ) {}

  private sweepOnce = onceSwept(() => sweepTmp(this.dataDir, 'settings.json', this.fsImpl.unlink))

  private get path(): string {
    return join(this.dataDir, 'settings.json')
  }

  async get(): Promise<{ settings: Settings; warnings: string[] }> {
    // Read + quarantine under the file's queue key so a concurrent set() can't interleave.
    return this.queue.run(this.path, async () => {
      await this.sweepOnce()
      let raw: string
      try {
        raw = await this.fsImpl.readFile(this.path, 'utf8')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT')
          return { settings: DEFAULT_SETTINGS, warnings: [] }
        throw err
      }
      try {
        const r = SettingsSchema.safeParse(JSON.parse(raw))
        if (r.success) return { settings: r.data, warnings: [] }
      } catch {
        // fall through to quarantine
      }
      const warning = await quarantine(this.dataDir, 'settings.json', this.now(), this.fsImpl)
      return { settings: DEFAULT_SETTINGS, warnings: [warning] }
    })
  }

  async set(s: Settings): Promise<void> {
    await this.queue.run(this.path, () => atomicWriteJson(this.path, s, this.fsImpl))
  }
}
