import { vi } from 'vitest'
import type { WorkspaceApi } from './workspace'

/**
 * No-op fakes for the WorkspaceApi methods most tests don't exercise (P2). Every one resolves
 * at once, so the `init` that mutating actions wait for never blocks a test.
 */
type Extras = Pick<
  WorkspaceApi,
  | 'collections:list'
  | 'collections:save'
  | 'collections:delete'
  | 'environments:list'
  | 'environments:save'
  | 'environments:delete'
  | 'settings:get'
  | 'settings:set'
  | 'history:list'
  | 'history:delete'
  | 'history:clear'
>

export function noopExtras(): Extras {
  return {
    'collections:list': vi.fn(async () => ({ collections: [], warnings: [] })),
    'collections:save': vi.fn(async () => undefined),
    'collections:delete': vi.fn(async () => undefined),
    'environments:list': vi.fn(async () => ({ environments: [], warnings: [] })),
    'environments:save': vi.fn(async () => undefined),
    'environments:delete': vi.fn(async () => undefined),
    'settings:get': vi.fn(async () => ({
      settings: {
        schemaVersion: 1 as const,
        split: 0.5,
        navigatorCollapsed: false,
        activeEnvironmentId: null
      },
      warnings: []
    })),
    'settings:set': vi.fn(async () => undefined),
    'history:list': vi.fn(async () => ({ entries: [], warnings: [] })),
    'history:delete': vi.fn(async () => undefined),
    'history:clear': vi.fn(async () => undefined)
  }
}
