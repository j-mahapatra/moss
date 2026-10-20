import type { StoreApi } from 'zustand/vanilla'
import type { WorkspaceApi, WorkspaceState } from '../workspace'

/** What every slice factory receives: the store's set/get and the (widened) api. */
export type SliceCtx = {
  set: StoreApi<WorkspaceState>['setState']
  get: StoreApi<WorkspaceState>['getState']
  api: WorkspaceApi
}

/**
 * Wraps a mutating action so it runs only after `init` has applied the loaded state. Once
 * loaded it calls through synchronously, so ops keep the order the caller issued them in.
 */
export function afterInit<A extends unknown[], R>(
  get: SliceCtx['get'],
  fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args) =>
    get().loaded
      ? fn(...args)
      : get()
          .init()
          .then(() => fn(...args))
}
