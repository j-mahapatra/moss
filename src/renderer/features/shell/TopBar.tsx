import { useWorkspace } from '../../state/workspace-hooks'
import { EnvironmentChip } from '../environments/EnvironmentChip'
import './TopBar.css'

export function TopBar(): React.JSX.Element {
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen)
  return (
    <header className="topbar">
      <span className="topbar__wordmark">Moss</span>
      <button
        type="button"
        className="topbar__search"
        aria-label="Open command palette (⌘K)"
        onClick={() => setPaletteOpen(true)}
      >
        <span className="topbar__search-text">Search requests, collections, commands…</span>
        <kbd className="topbar__search-key">⌘K</kbd>
      </button>
      <EnvironmentChip />
    </header>
  )
}
