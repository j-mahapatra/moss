import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { foldGutter } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultViewMode, mediaType, pickBodyView, type ViewMode } from '../../../shared/body-view'
import { formatBytes } from '../../../shared/format'
import type { HttpResponse } from '../../../shared/types'
import { Button } from '../../ui'
import { CodeEditor } from '../requests/CodeEditor'

type Decoded = { bytes: Uint8Array; text: string }
const decodedCache = new WeakMap<HttpResponse, Decoded>()

function decode(response: HttpResponse): Decoded {
  let hit = decodedCache.get(response)
  if (!hit) {
    const bytes = Uint8Array.from(atob(response.bodyBase64), (c) => c.charCodeAt(0))
    hit = { bytes, text: new TextDecoder('utf-8').decode(bytes) }
    decodedCache.set(response, hit)
  }
  return hit
}

function contentTypeOf(response: HttpResponse): string | undefined {
  return response.headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1]
}

function extensionFor(type: string, kind: string): string {
  if (kind === 'image') return `.${type.split('/')[1]?.split('+')[0] || 'bin'}`
  if (kind === 'json') return '.json'
  if (kind === 'text') {
    if (type === 'text/html') return '.html'
    if (type.endsWith('xml')) return '.xml'
    return '.txt'
  }
  return '.bin'
}

const READ_ONLY: Extension = EditorState.readOnly.of(true)
const noop = (): void => undefined

export function BodyView({ response }: { response: HttpResponse }): React.JSX.Element {
  const { bytes, text } = useMemo(() => decode(response), [response])
  const type = mediaType(contentTypeOf(response))
  const kind = useMemo(() => pickBodyView(type, bytes), [type, bytes])
  const [choice, setChoice] = useState<{ for: HttpResponse; mode: ViewMode } | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const parsed = useMemo(() => {
    if (kind !== 'json') return null
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return null
    }
  }, [kind, text])

  const requested: ViewMode =
    choice?.for === response ? choice.mode : defaultViewMode(response.size)
  const invalidJson = kind === 'json' && parsed === null
  const mode: ViewMode = kind === 'json' && !invalidJson ? requested : 'raw'
  const shown = kind === 'json' && mode === 'pretty' && parsed !== null ? parsed : text

  const extensions = useMemo<Extension[]>(() => {
    const ext: Extension[] = [READ_ONLY]
    if (kind === 'json' && mode === 'pretty') ext.push(json(), foldGutter())
    else if (kind === 'text' && type.endsWith('xml')) ext.push(xml())
    return ext
  }, [kind, mode, type])

  const copy = (): void => {
    void navigator.clipboard.writeText(shown).then(() => {
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1500)
    })
  }
  const save = (): void => {
    void window.api['response:save']({
      bodyBase64: response.bodyBase64,
      suggestedName: `response${extensionFor(type, kind)}`
    })
  }

  return (
    <div className="response-body" data-response-body>
      <div className="response-body__toolbar">
        {kind === 'json' ? (
          <div className="response-body__modes" role="group" aria-label="Body format">
            {(['pretty', 'raw'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="response-body__mode"
                aria-pressed={mode === m}
                disabled={invalidJson && m === 'pretty'}
                onClick={() => setChoice({ for: response, mode: m })}
              >
                {m === 'pretty' ? 'Pretty' : 'Raw'}
              </button>
            ))}
          </div>
        ) : null}
        {invalidJson ? (
          <span className="response-body__note">Not valid JSON — showing raw</span>
        ) : null}
        <span className="response-body__spacer" />
        {kind !== 'binary' ? (
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={save}>
          Save
        </Button>
      </div>
      {kind === 'image' ? (
        <img
          className="response-body__image"
          alt="Response body"
          src={`data:${type};base64,${response.bodyBase64}`}
        />
      ) : kind === 'binary' ? (
        <p className="response-body__binary">Binary response · {formatBytes(response.size)}</p>
      ) : (
        <CodeEditor
          key={`${kind}:${mode}:${type}`}
          className="moss-code--body"
          label="Response body"
          value={shown}
          onChange={noop}
          extensions={extensions}
        />
      )}
    </div>
  )
}
