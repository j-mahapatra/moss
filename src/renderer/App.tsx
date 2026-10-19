import { useEffect, useState } from 'react'
import { Workbench } from './features/shell/Workbench'
import { createWorkspaceStore } from './state/workspace'
import { WorkspaceProvider } from './state/workspace-context'

function App(): React.JSX.Element {
  const [store] = useState(() => createWorkspaceStore(window.api))
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
