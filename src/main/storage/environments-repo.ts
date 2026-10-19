import { EnvironmentSchema } from '../../shared/schemas'
import type { Environment } from '../../shared/types'
import { defaultFs, type AtomicFs, type WriteQueue } from './atomic-write'
import { DocRepo } from './doc-repo'

export class EnvironmentsRepo {
  private repo: DocRepo<Environment>

  constructor(
    dataDir: string,
    queue: WriteQueue,
    fsImpl: AtomicFs = defaultFs,
    now: () => number = Date.now
  ) {
    this.repo = new DocRepo<Environment>({
      dataDir,
      subdir: 'environments',
      schema: EnvironmentSchema,
      label: 'environment',
      queue,
      fsImpl,
      now
    })
  }

  async list(): Promise<{ environments: Environment[]; warnings: string[] }> {
    const { values, warnings } = await this.repo.list()
    return { environments: values, warnings }
  }

  get(id: string): Promise<Environment | null> {
    return this.repo.get(id)
  }

  save(e: Environment): Promise<void> {
    return this.repo.save(e)
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id)
  }
}
