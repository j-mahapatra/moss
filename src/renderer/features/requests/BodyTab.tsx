import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import type { Extension } from '@codemirror/state'
import type { RequestBody } from '../../../shared/types'
import { KeyValueGrid, Select } from '../../ui'
import { useWorkspace } from '../../state/workspace-hooks'
import { CodeEditor } from './CodeEditor'
import { FormDataGrid } from './FormDataGrid'
import './BodyTab.css'

type Mode = RequestBody['mode']

/** Per-mode data kept for the session so switching modes never loses typing. */
export type BodyCache = Map<Mode, RequestBody>

const MODES: { value: Mode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'raw', label: 'Raw' },
  { value: 'urlencoded', label: 'URL-encoded' },
  { value: 'form-data', label: 'Form data' }
]

const CONTENT_TYPES = [
  { value: 'application/json', label: 'JSON' },
  { value: 'text/plain', label: 'Text' },
  { value: 'application/xml', label: 'XML' }
]

function initial(mode: Mode): RequestBody {
  switch (mode) {
    case 'none':
      return { mode: 'none' }
    case 'raw':
      return { mode: 'raw', contentType: 'application/json', text: '' }
    case 'urlencoded':
      return { mode: 'urlencoded', fields: [] }
    case 'form-data':
      return { mode: 'form-data', fields: [] }
  }
}

function languageFor(contentType: string): Extension[] {
  if (contentType === 'application/json') return [json()]
  if (contentType === 'application/xml') return [xml()]
  return []
}

export function BodyTab({ cache }: { cache: BodyCache }): React.JSX.Element {
  const body = useWorkspace((s) => s.draft.body)
  const updateDraft = useWorkspace((s) => s.updateDraft)

  const switchMode = (mode: Mode): void => {
    if (mode === body.mode) return
    cache.set(body.mode, body)
    updateDraft({ body: cache.get(mode) ?? initial(mode) })
  }

  return (
    <div className="body-tab">
      <div role="radiogroup" aria-label="Body mode" className="body-tab__modes">
        {MODES.map((m) => (
          <label key={m.value} className="body-tab__mode">
            <input
              type="radio"
              name="body-mode"
              value={m.value}
              checked={body.mode === m.value}
              onChange={() => switchMode(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>

      {body.mode === 'none' && <p className="body-tab__note">This request has no body.</p>}

      {body.mode === 'raw' && (
        <>
          <div className="body-tab__type">
            <Select
              aria-label="Content type"
              value={body.contentType}
              options={CONTENT_TYPES}
              onValueChange={(contentType) => updateDraft({ body: { ...body, contentType } })}
            />
          </div>
          <CodeEditor
            key={body.contentType}
            label="Body"
            className="moss-code--body"
            value={body.text}
            extensions={languageFor(body.contentType)}
            onChange={(text) => updateDraft({ body: { ...body, text } })}
          />
        </>
      )}

      {body.mode === 'urlencoded' && (
        <KeyValueGrid
          rows={body.fields}
          onChange={(fields) => updateDraft({ body: { mode: 'urlencoded', fields } })}
        />
      )}

      {body.mode === 'form-data' && (
        <FormDataGrid
          rows={body.fields}
          pickFile={() => window.api['dialog:pick-file']()}
          onChange={(fields) => updateDraft({ body: { mode: 'form-data', fields } })}
        />
      )}
    </div>
  )
}
