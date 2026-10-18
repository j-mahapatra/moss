import { Notice } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import './Notices.css'

export function Notices(): React.JSX.Element | null {
  const notices = useWorkspace((s) => s.notices)
  const dismiss = useWorkspace((s) => s.dismissNotice)
  if (notices.length === 0) return null
  return (
    <div className="notices">
      {notices.map((n) => (
        <Notice key={n.id} tone={n.tone} onDismiss={() => dismiss(n.id)}>
          {n.message}
        </Notice>
      ))}
    </div>
  )
}
