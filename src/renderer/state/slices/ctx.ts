import type { StoreApi } from 'zustand/vanilla'
import type { WorkspaceApi, WorkspaceState } from '../workspace'

/** What every slice factory receives: the store's set/get and the (widened) api. */
export type SliceCtx = {
  set: StoreApi<WorkspaceState>['setState']
  get: StoreApi<WorkspaceState>['getState']
  api: WorkspaceApi
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
