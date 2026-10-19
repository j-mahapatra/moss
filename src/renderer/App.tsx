import { useEffect, useState } from 'react'
import { Workbench } from './features/shell/Workbench'
import type { StoreApi } from 'zustand/vanilla'
import { createWorkspaceStore, type WorkspaceState } from './state/workspace'
import { WorkspaceProvider } from './state/workspace-context'

function App({ store: given }: { store?: StoreApi<WorkspaceState> }): React.JSX.Element {
  const [store] = useState(() => given ?? createWorkspaceStore(window.api))
  useEffect(() => {
    void store.getState().init()
    // Settings saves are debounced; write any pending one before the window goes (RF5).
    const flush = (): void => void store.getState().flushSettings()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [store])
  return (
    <WorkspaceProvider store={store}>
      <Workbench />
    </WorkspaceProvider>
  )
}

export default App
