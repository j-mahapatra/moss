import { IconButton } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import { CollectionsIcon } from './icons'
import './IconRail.css'

export function IconRail(): React.JSX.Element {
  const collapsed = useWorkspace((s) => s.navigatorCollapsed)
  const toggle = useWorkspace((s) => s.toggleNavigator)
  return (
    <nav className="icon-rail" aria-label="Sidebar">
      <IconButton
        label="Collections"
        aria-pressed={!collapsed}
        className="icon-rail__button"
        onClick={toggle}
      >
        <CollectionsIcon />
      </IconButton>
    </nav>
  )
}
