import { useCallback, useState } from 'react'
import { parseQuery } from '../../../shared/url-params'
import { Button, Tabs } from '../../ui'
import { selectScope } from '../../state/selectors'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import { AuthTab } from './AuthTab'
import { BodyTab, type BodyCache } from './BodyTab'
import { HeadersTab } from './HeadersTab'
import { MethodSelect } from './MethodSelect'
import { ParamsTab } from './ParamsTab'
import { UrlBar } from './UrlBar'
import './RequestPane.css'

export function RequestPane(): React.JSX.Element {
  const store = useWorkspaceStore()
  const method = useWorkspace((s) => s.draft.method)
  const url = useWorkspace((s) => s.draft.url)
  const headerCount = useWorkspace((s) => s.draft.headers.filter((h) => h.enabled).length)
  const scope = useWorkspace(selectScope)
  const inFlight = useWorkspace((s) => s.inFlight !== null)
  const [tab, setTab] = useState('params')
  const [bodyCache] = useState<BodyCache>(() => new Map())
  const submit = useCallback(() => void store.getState().send(), [store])
  const pasteCurl = useCallback((text: string) => store.getState().applyCurlToDraft(text), [store])

  const onUrlChange = (next: string): void => {
    const { draft, updateDraft } = store.getState()
    updateDraft({
      url: next,
      params: [...parseQuery(next), ...draft.params.filter((p) => !p.enabled)]
    })
  }

  return (
    <section aria-label="Request" className="request-pane">
      <div className="request-pane__bar">
        <MethodSelect
          value={method}
          onChange={(m) => store.getState().updateDraft({ method: m })}
        />
        <UrlBar
          value={url}
          scope={scope}
          onChange={onUrlChange}
          onSubmit={submit}
          onPasteCurl={pasteCurl}
        />
        <Button
          variant={inFlight ? 'danger' : 'primary'}
          className="request-pane__send"
          onKeyDown={(e) => {
            // The button swaps Send for Cancel under the key; a held key must not click it again.
            if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault()
          }}
          onClick={inFlight ? () => store.getState().cancel() : submit}
        >
          {inFlight ? 'Cancel' : 'Send'}
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'params', label: 'Params' },
          { value: 'headers', label: `Headers (${headerCount})` },
          { value: 'body', label: 'Body' },
          { value: 'auth', label: 'Auth' }
        ]}
      >
        {tab === 'params' && <ParamsTab />}
        {tab === 'headers' && <HeadersTab />}
        {tab === 'body' && <BodyTab cache={bodyCache} />}
        {tab === 'auth' && <AuthTab />}
      </Tabs>
    </section>
  )
}
