import { useEffect, useState } from 'react'
import { useWorkspace } from '../../state/workspace'
import { Button, Tabs } from '../../ui'
import { BodyView } from './BodyView'
import { ErrorView } from './ErrorView'
import { HeadersTable } from './HeadersTable'
import { StatusBar } from './StatusBar'
import './ResponsePane.css'

function InFlight({ startedAt }: { startedAt: number }): React.JSX.Element {
  const cancel = useWorkspace((s) => s.cancel)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  const seconds = Math.max(0, now - startedAt) / 1000
  return (
    <div className="response-flight" role="status">
      <div className="response-flight__bar" aria-hidden="true" />
      <p className="response-flight__elapsed">Waiting… {seconds.toFixed(1)} s</p>
      <Button variant="secondary" size="sm" onClick={cancel}>
        Cancel
      </Button>
    </div>
  )
}

export function ResponsePane(): React.JSX.Element {
  const result = useWorkspace((s) => s.result)
  const inFlight = useWorkspace((s) => s.inFlight)
  const [tab, setTab] = useState('body')

  let content: React.JSX.Element
  if (inFlight) {
    content = <InFlight startedAt={inFlight.startedAt} />
  } else if (!result) {
    content = <p className="response-empty">Send a request to see the response here.</p>
  } else if (!result.ok) {
    content = <ErrorView error={result.error} />
  } else {
    const { response } = result
    content = (
      <>
        <StatusBar response={response} />
        <Tabs
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'body', label: 'Body' },
            { value: 'headers', label: `Headers (${response.headers.length})` }
          ]}
        >
          {tab === 'headers' ? (
            <HeadersTable headers={response.headers} />
          ) : (
            <BodyView response={response} />
          )}
        </Tabs>
      </>
    )
  }
  return (
    <section aria-label="Response" className="response-pane">
      {content}
    </section>
  )
}
