import type { RequestAuth } from '../../../shared/types'
import { Input, SecretInput, Select } from '../../ui'
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
  // Keys the credential fields so a revealed value is masked again on another draft.
  const draftId = useWorkspace((s) => s.draft.id)
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
        <div className="auth-tab__field">
          <span aria-hidden="true">Token</span>
          <SecretInput
            key={draftId}
            label="Token"
            value={auth.token}
            onChange={(token) => updateDraft({ auth: { type: 'bearer', token } })}
          />
        </div>
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
          <div className="auth-tab__field">
            <span aria-hidden="true">Password</span>
            <SecretInput
              key={draftId}
              label="Password"
              value={auth.password}
              onChange={(password) => updateDraft({ auth: { ...auth, password } })}
            />
          </div>
        </>
      )}
    </div>
  )
}
