import { CollectionSchema } from '../../shared/schemas'
import type { Collection } from '../../shared/types'
import { defaultFs, type AtomicFs, type WriteQueue } from './atomic-write'
import { DocRepo } from './doc-repo'
import { plainCodec, type SecretCodec } from '../secrets/secret-codec'

export class CollectionsRepo {
  private repo: DocRepo<Collection>

  constructor(
    dataDir: string,
    queue: WriteQueue,
    fsImpl: AtomicFs = defaultFs,
    now: () => number = Date.now,
    codec: SecretCodec = plainCodec
  ) {
    this.repo = new DocRepo<Collection>({
      dataDir,
      subdir: 'collections',
      schema: CollectionSchema,
      label: 'collection',
      queue,
      fsImpl,
      now,
      codec: {
        available: () => codec.available(),
        seal: (doc) => codec.sealCollection(doc),
        open: (doc) => codec.openCollection(doc)
      }
    })
  }

  async list(): Promise<{ collections: Collection[]; warnings: string[] }> {
    const { values, warnings } = await this.repo.list()
    return { collections: values, warnings }
  }

  get(id: string): Promise<Collection | null> {
    return this.repo.get(id)
  }

  save(c: Collection): Promise<void> {
    return this.repo.save(c)
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id)
  }
}
