import { SplitPane } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import { Navigator } from '../collections/Navigator'
import { RequestPane } from '../requests/RequestPane'
import { ResponsePane } from '../response/ResponsePane'
import { DiscardDialog } from './DiscardDialog'
import { IconRail } from './IconRail'
import { Notices } from './Notices'
import { TopBar } from './TopBar'
import { useMediaQuery } from './useMediaQuery'
import { useShortcuts } from './useShortcuts'
import './Workbench.css'

export function Workbench(): React.JSX.Element {
  useShortcuts()
  const wide = useMediaQuery('(min-width: 1100px)')
  const split = useWorkspace((s) => s.split)
  const collapsed = useWorkspace((s) => s.navigatorCollapsed)
  const setSplit = useWorkspace((s) => s.setSplit)
  return (
    <div className="workbench">
      <TopBar />
      <Notices />
      <div className={collapsed ? 'workbench__body workbench__body--collapsed' : 'workbench__body'}>
        <IconRail />
        {!collapsed && <Navigator />}
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
      <DiscardDialog />
    </div>
  )
}
