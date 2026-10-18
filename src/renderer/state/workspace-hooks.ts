import { createContext, useContext } from 'react'
import { useStore, type StoreApi } from 'zustand'
import type { WorkspaceState } from './workspace'

export const WorkspaceContext = createContext<StoreApi<WorkspaceState> | null>(null)

export function useWorkspaceStore(): StoreApi<WorkspaceState> {
  const store = useContext(WorkspaceContext)
  if (!store) throw new Error('useWorkspace must be used inside a <WorkspaceProvider>')
  return store
}

export function useWorkspace<T>(selector: (s: WorkspaceState) => T): T {
  return useStore(useWorkspaceStore(), selector)
}
