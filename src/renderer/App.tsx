// Temporary kitchen sink for checking the design system in both themes. Task 9 replaces it.
import { useState } from 'react'
import type { KeyValue } from '../shared/types'
import { Badge, Button, IconButton, Input, KeyValueGrid, Select, SplitPane, Tabs } from './ui'
import './App.css'

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))

function App(): React.JSX.Element {
  const [method, setMethod] = useState('GET')
  const [tab, setTab] = useState('params')
  const [ratio, setRatio] = useState(0.5)
  const [rows, setRows] = useState<KeyValue[]>([
    { key: 'page', value: '2', enabled: true },
    { key: 'limit', value: '50', enabled: false }
  ])

  return (
    <div className="sink">
      <header className="sink__bar">
        <strong>Moss</strong>
        <Button variant="ghost" size="sm">
          Search requests
        </Button>
        <span className="sink__grow" />
        <Badge tone="accent">dev</Badge>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const root = document.documentElement
            root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
          }}
        >
          Toggle theme
        </Button>
      </header>
      <SplitPane orientation="horizontal" ratio={ratio} onRatioChange={setRatio}>
        <section className="sink__pane">
          <div className="sink__url">
            <Select
              aria-label="Method"
              value={method}
              onValueChange={setMethod}
              options={methods}
            />
            <Input mono aria-label="URL" defaultValue="{{baseUrl}}/users/42" />
            <Button variant="primary">Send</Button>
          </div>
          <p className="sink__vars">
            <span className="sink__var sink__var--ok">{'{{baseUrl}}'}</span>
            <span className="sink__var sink__var--missing">{'{{token}}'}</span>
          </p>
          <Tabs
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: 'params', label: 'Params' },
              { value: 'headers', label: 'Headers' },
              { value: 'body', label: 'Body' },
              { value: 'auth', label: 'Auth' }
            ]}
          >
            {tab === 'params' ? (
              <KeyValueGrid rows={rows} onChange={setRows} />
            ) : (
              <p className="sink__muted">Nothing here yet.</p>
            )}
          </Tabs>
          <div className="sink__row">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <IconButton label="Copy">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="5" width="8" height="8" rx="1.5" />
                <path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" />
              </svg>
            </IconButton>
          </div>
        </section>
        <section className="sink__pane">
          <div className="sink__row">
            <Badge tone="2xx">200 OK</Badge>
            <Badge tone="3xx">301 Moved</Badge>
            <Badge tone="4xx">404 Not Found</Badge>
            <Badge tone="5xx">503 Unavailable</Badge>
            <Badge tone="neutral">142 ms</Badge>
            <Badge tone="danger">timeout</Badge>
          </div>
          <pre className="sink__code">{`{\n  "id": 42,\n  "name": "Ada Lovelace",\n  "active": true\n}`}</pre>
          <p className="sink__muted">Response headers and timing appear here.</p>
        </section>
      </SplitPane>
    </div>
  )
}

export default App
