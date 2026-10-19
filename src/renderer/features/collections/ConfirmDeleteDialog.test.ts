import { describe, expect, it } from 'vitest'
import type { DeleteTarget } from './ConfirmDeleteDialog'

describe('DeleteTarget', () => {
  it('requires a collectionId on folder and request targets (checked by tsc)', () => {
    const targets: DeleteTarget[] = [
      { kind: 'collection', id: 'c1', name: 'Shop' },
      { kind: 'folder', id: 'f1', collectionId: 'c1', name: 'Docs' },
      { kind: 'request', id: 'r1', collectionId: 'c1', name: 'Get' },
      { kind: 'environment', id: 'e1', name: 'Staging', active: true }
    ]
    // @ts-expect-error a folder target without its collectionId must not type-check
    const folder: DeleteTarget = { kind: 'folder', id: 'f2', name: 'Loose' }
    // @ts-expect-error an environment target must say whether it is active
    const env: DeleteTarget = { kind: 'environment', id: 'e2', name: 'Prod' }
    expect([...targets, folder, env]).toHaveLength(6)
  })
})
