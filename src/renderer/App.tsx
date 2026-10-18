import { useEffect, useState } from 'react'
import { Workbench } from './features/shell/Workbench'
import { createWorkspaceStore } from './state/workspace'
import { WorkspaceProvider } from './state/workspace-context'

function App(): React.JSX.Element {
  const [store] = useState(() => createWorkspaceStore(window.api))
  useEffect(() => {
    void store.getState().init()
  }, [store])
  return (
    <WorkspaceProvider store={store}>
      <Workbench />
    </WorkspaceProvider>
  )
}

export default App
