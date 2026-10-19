import { IconButton } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import type { NavigatorView } from '../../state/slices/ui'
import { CollectionsIcon, EnvironmentsIcon, HistoryIcon } from './icons'
import './IconRail.css'

export function IconRail(): React.JSX.Element {
  const collapsed = useWorkspace((s) => s.navigatorCollapsed)
  const view = useWorkspace((s) => s.ui.navigatorView)
  const toggle = useWorkspace((s) => s.toggleNavigator)
  const showPanel = useWorkspace((s) => s.showPanel)
  const item = (
    target: NavigatorView,
    label: string,
    icon: React.JSX.Element
  ): React.JSX.Element => (
    <IconButton
      label={label}
      aria-pressed={!collapsed && view === target}
      className="icon-rail__button"
      onClick={() => (view === target ? toggle() : showPanel(target))}
    >
      {icon}
    </IconButton>
  )
  return (
    <nav className="icon-rail" aria-label="Sidebar">
      {item('collections', 'Collections', <CollectionsIcon />)}
      {item('environments', 'Environments', <EnvironmentsIcon />)}
      {item('history', 'History', <HistoryIcon />)}
    </nav>
  )
}
