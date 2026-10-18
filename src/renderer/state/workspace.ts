import { createStore, type StoreApi } from 'zustand/vanilla'
import type { MossApi } from '../../shared/ipc-contract'
import { newRequestSpec, type RequestSpec, type SendResult } from '../../shared/types'

export type WorkspaceState = {
  draft: RequestSpec
  inFlight: { requestId: string; startedAt: number } | null
  result: SendResult | null
  /** Request pane share of the split, 0.2 to 0.8. */
  split: number
  updateDraft(patch: Partial<RequestSpec>): void
  send(): Promise<void>
  cancel(): void
  setSplit(r: number): void
}

export const SPLIT_DEFAULT = 0.5
const SPLIT_LOW = 0.2
const SPLIT_HIGH = 0.8

export type WorkspaceApi = Pick<MossApi, 'request:send' | 'request:cancel'>

export function createWorkspaceStore(api: WorkspaceApi): StoreApi<WorkspaceState> {
  return createStore<WorkspaceState>()((set, get) => ({
    draft: newRequestSpec(),
    inFlight: null,
    result: null,
    split: SPLIT_DEFAULT,

    updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),

    setSplit: (r) => set({ split: Math.min(SPLIT_HIGH, Math.max(SPLIT_LOW, r)) }),

    cancel: () => {
      const { inFlight } = get()
      if (!inFlight) return
      void Promise.resolve(api['request:cancel']({ requestId: inFlight.requestId })).catch(
        () => undefined
      )
    },

    send: async () => {
      get().cancel()
      const requestId = crypto.randomUUID()
      set({ inFlight: { requestId, startedAt: Date.now() } })
      const isCurrent = (): boolean => get().inFlight?.requestId === requestId
      try {
        const result = await api['request:send']({ requestId, request: get().draft })
        if (isCurrent()) set({ result, inFlight: null })
      } catch (err) {
        if (isCurrent()) {
          const message = err instanceof Error ? err.message : String(err)
          set({
            result: {
              ok: false,
              error: { kind: 'unknown', message: `Request failed: ${message}` }
            },
            inFlight: null
          })
        }
      }
    }
  }))
}

export { WorkspaceProvider } from './workspace-context'
export { useWorkspace } from './workspace-hooks'
