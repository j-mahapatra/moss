import { buildScope, type VariableScope } from '../shared/variables'
import type { CollectionsRepo } from './storage/collections-repo'
import type { EnvironmentsRepo } from './storage/environments-repo'

/** Variable scope for a send: the environment layer wins over the collection layer. */
export function createScopeResolver(
  collections: Pick<CollectionsRepo, 'get'>,
  environments: Pick<EnvironmentsRepo, 'get'>
): (ids: { collectionId?: string; environmentId?: string }) => Promise<VariableScope> {
  return async ({ collectionId, environmentId }) => {
    const [env, col] = await Promise.all([
      environmentId ? environments.get(environmentId) : null,
      collectionId ? collections.get(collectionId) : null
    ])
    return buildScope(env?.variables ?? [], col?.variables ?? [])
  }
}
