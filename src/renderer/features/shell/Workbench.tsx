import { SplitPane } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import { RequestPane } from '../requests/RequestPane'
import { ResponsePane } from '../response/ResponsePane'
import { TopBar } from './TopBar'
import { useMediaQuery } from './useMediaQuery'
import { useShortcuts } from './useShortcuts'
import './Workbench.css'

export function Workbench(): React.JSX.Element {
  useShortcuts()
  const wide = useMediaQuery('(min-width: 1100px)')
  const split = useWorkspace((s) => s.split)
  const setSplit = useWorkspace((s) => s.setSplit)
  return (
    <div className="workbench">
      <TopBar />
      <main className="workbench__main">
        <SplitPane
          orientation={wide ? 'horizontal' : 'vertical'}
          ratio={split}
          onRatioChange={setSplit}
        >
          <RequestPane />
          <ResponsePane />
        </SplitPane>
      </main>
    </div>
  )
}
