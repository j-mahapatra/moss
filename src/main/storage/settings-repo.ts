import { readFile } from 'fs/promises'
import { join } from 'path'
import { SettingsSchema } from '../../shared/schemas'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types'
import { atomicWriteJson, defaultFs, WriteQueue, type AtomicFs } from './atomic-write'
import { quarantine } from './json-dir'

export class SettingsRepo {
  constructor(
    private dataDir: string,
    private queue: WriteQueue = new WriteQueue(),
    private fsImpl: AtomicFs = defaultFs,
    private now: () => number = Date.now
  ) {}

  private get path(): string {
    return join(this.dataDir, 'settings.json')
  }

  async get(): Promise<{ settings: Settings; warnings: string[] }> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
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
    const warning = await quarantine(this.dataDir, 'settings.json', this.now())
    return { settings: DEFAULT_SETTINGS, warnings: [warning] }
  }

  async set(s: Settings): Promise<void> {
    await this.queue.run(this.path, () => atomicWriteJson(this.path, s, this.fsImpl))
  }
}
