import { vi } from 'vitest'
import type { WorkspaceApi } from './workspace'

/** No-op fakes for the WorkspaceApi methods Plan 1 tests don't exercise (P2). */
type Extras = Pick<
  WorkspaceApi,
  'collections:list' | 'collections:save' | 'collections:delete' | 'settings:get' | 'settings:set'
>

export function noopExtras(): Extras {
  return {
    'collections:list': vi.fn(async () => ({ collections: [], warnings: [] })),
    'collections:save': vi.fn(async () => undefined),
    'collections:delete': vi.fn(async () => undefined),
    'settings:get': vi.fn(async () => ({
      settings: {
        schemaVersion: 1 as const,
        split: 0.5,
        navigatorCollapsed: false,
        activeEnvironmentId: null
      },
      warnings: []
    })),
    'settings:set': vi.fn(async () => undefined)
  }
}
