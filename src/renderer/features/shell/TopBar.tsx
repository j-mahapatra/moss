import { EnvironmentChip } from '../environments/EnvironmentChip'
import './TopBar.css'

export function TopBar(): React.JSX.Element {
  return (
    <header className="topbar">
      <span className="topbar__wordmark">Moss</span>
      <EnvironmentChip />
    </header>
  )
}
