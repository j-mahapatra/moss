import type { RequestAuth } from '../../../shared/types'
import { Input, Select } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import './AuthTab.css'

const OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic auth' }
]

function fresh(type: string): RequestAuth {
  if (type === 'bearer') return { type: 'bearer', token: '' }
  if (type === 'basic') return { type: 'basic', username: '', password: '' }
  return { type: 'none' }
}

export function AuthTab(): React.JSX.Element {
  const auth = useWorkspace((s) => s.draft.auth)
  const updateDraft = useWorkspace((s) => s.updateDraft)
  return (
    <div className="auth-tab">
      <Select
        aria-label="Auth type"
        value={auth.type}
        options={OPTIONS}
        onValueChange={(t) => updateDraft({ auth: fresh(t) })}
      />
      {auth.type === 'bearer' && (
        <label className="auth-tab__field">
          <span>Token</span>
          <Input
            mono
            spellCheck={false}
            value={auth.token}
            onChange={(e) => updateDraft({ auth: { type: 'bearer', token: e.target.value } })}
          />
        </label>
      )}
      {auth.type === 'basic' && (
        <>
          <label className="auth-tab__field">
            <span>Username</span>
            <Input
              spellCheck={false}
              value={auth.username}
              onChange={(e) => updateDraft({ auth: { ...auth, username: e.target.value } })}
            />
          </label>
          <label className="auth-tab__field">
            <span>Password</span>
            <Input
              type="password"
              autoComplete="off"
              value={auth.password}
              onChange={(e) => updateDraft({ auth: { ...auth, password: e.target.value } })}
            />
          </label>
        </>
      )}
    </div>
  )
}
