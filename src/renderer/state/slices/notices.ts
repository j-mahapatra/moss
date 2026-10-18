import type { Notice, WorkspaceState } from '../workspace'
import type { SliceCtx } from './ctx'

export type AddNotice = (tone: Notice['tone'], message: string) => void

export function createNotices({ set }: SliceCtx): {
  addNotice: AddNotice
  slice: Pick<WorkspaceState, 'notices' | 'dismissNotice'>
} {
  const addNotice: AddNotice = (tone, message) =>
    set((s) =>
      s.notices.some((n) => n.tone === tone && n.message === message)
        ? s
        : { notices: [...s.notices, { id: crypto.randomUUID(), tone, message }] }
    )
  return {
    addNotice,
    slice: {
      notices: [],
      dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
    }
  }
}
