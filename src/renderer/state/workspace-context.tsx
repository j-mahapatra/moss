import type { ReactNode } from 'react'
import type { StoreApi } from 'zustand'
import { WorkspaceContext } from './workspace-hooks'
import type { WorkspaceState } from './workspace'

export function WorkspaceProvider({
  store,
  children
}: {
  store: StoreApi<WorkspaceState>
  children: ReactNode
}): React.JSX.Element {
  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>
}
