import { SplitPane } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import { EnvironmentsPanel } from '../environments/EnvironmentsPanel'
import { HistoryPanel } from '../history/HistoryPanel'
import { ImportPanel } from '../import-export/ImportPanel'
import { PaletteHost } from '../palette/PaletteHost'
import { Navigator } from '../collections/Navigator'
import { SaveDialog } from '../collections/SaveDialog'
import { VariablesDialog } from '../collections/VariablesDialog'
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
  const view = useWorkspace((s) => s.ui.navigatorView)
  const setSplit = useWorkspace((s) => s.setSplit)
  return (
    <div className="workbench">
      <TopBar />
      <Notices />
      <div className={collapsed ? 'workbench__body workbench__body--collapsed' : 'workbench__body'}>
        <IconRail />
        {!collapsed && view === 'collections' && <Navigator />}
        {!collapsed && view === 'environments' && <EnvironmentsPanel />}
        {!collapsed && view === 'history' && <HistoryPanel />}
        {!collapsed && view === 'import' && <ImportPanel />}
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
      <SaveDialog />
      <VariablesDialog />
      <PaletteHost />
    </div>
  )
}
