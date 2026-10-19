import { useId, useRef, useState } from 'react'
import {
  IMPORT_MAX_BYTES,
  IMPORT_TOO_LARGE,
  type ImportReport
} from '../../../shared/import-export/report'
import { errorMessage } from '../../state/slices/ctx'
import type { ImportOutcome } from '../../state/workspace'
import { useWorkspace } from '../../state/workspace-hooks'
import { Button } from '../../ui'
import './ImportPanel.css'

type Result =
  | { kind: 'collection'; name: string; report: ImportReport }
  | { kind: 'request'; report: ImportReport }
  | { kind: 'error'; message: string }

/** What the result area shows for an outcome; null leaves it empty. */
function resultOf(outcome: ImportOutcome): Result | null {
  switch (outcome.kind) {
    case 'collection':
      return { kind: 'collection', name: outcome.collection.name, report: outcome.report }
    case 'request':
      // A blocked open shows the discard dialog, which is feedback enough.
      return outcome.opened === 'opened' ? { kind: 'request', report: outcome.report } : null
    case 'error':
      return { kind: 'error', message: outcome.message }
    case 'failed':
      // The store already raised a notice.
      return null
  }
}

const succeeded = (outcome: ImportOutcome): boolean =>
  outcome.kind === 'collection' || (outcome.kind === 'request' && outcome.opened === 'opened')

export function ImportPanel(): React.JSX.Element {
  const importText = useWorkspace((s) => s.importText)
  const importFile = useWorkspace((s) => s.importFile)
  const showPanel = useWorkspace((s) => s.showPanel)

  const pasteId = useId()
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  /** Runs one import at a time and shows its outcome. */
  const run = async (start: () => Promise<ImportOutcome | null>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try {
      const outcome = await start()
      if (outcome === null) return false
      setResult(resultOf(outcome))
      return succeeded(outcome)
    } finally {
      setBusy(false)
      // Disabling a focused button blurs it; don't leave keyboard users on <body>.
      const at = document.activeElement
      if (at === document.body || at === importRef.current || at === openRef.current) {
        pasteRef.current?.focus()
      }
    }
  }

  const importPasted = (): void => {
    if (text.trim() === '' || busy) return
    void run(() => importText(text)).then((ok) => {
      if (ok) setText('')
    })
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (!file || busy) return
    if (file.size > IMPORT_MAX_BYTES) {
      setResult({ kind: 'error', message: IMPORT_TOO_LARGE })
      return
    }
    void run(() =>
      file.text().then(importText, (err: unknown) => ({
        kind: 'error' as const,
        message: `Couldn't read the file: ${errorMessage(err)}`
      }))
    )
  }

  return (
    <aside className="navigator import-panel" aria-label="Import">
      <div className="navigator__header">
        <h2 className="navigator__title">Import</h2>
      </div>
      <div className="navigator__body import-panel__body">
        <div
          role="region"
          aria-label="Drop a collection file here"
          className={over ? 'import-panel__drop import-panel__drop--over' : 'import-panel__drop'}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <p className="navigator__quiet">Drop a collection file here</p>
          <Button
            ref={openRef}
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run(importFile)}
          >
            Open file…
          </Button>
        </div>
        <label className="import-panel__label" htmlFor={pasteId}>
          Paste a collection or curl command
        </label>
        <textarea
          ref={pasteRef}
          id={pasteId}
          className="import-panel__paste"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              // Keep the global Send shortcut from also firing.
              e.preventDefault()
              if (!e.repeat) importPasted()
            }
          }}
        />
        <div className="import-panel__actions">
          <Button
            ref={importRef}
            variant="primary"
            size="sm"
            disabled={busy || text.trim() === ''}
            onClick={importPasted}
          >
            Import
          </Button>
        </div>
        <div role="status" className="import-panel__status">
          {result && <ResultView result={result} onShow={() => showPanel('collections')} />}
        </div>
      </div>
    </aside>
  )
}

function ResultView({ result, onShow }: { result: Result; onShow(): void }): React.JSX.Element {
  if (result.kind === 'error') {
    return <p className="import-panel__message import-panel__message--danger">{result.message}</p>
  }
  return (
    <>
      {result.kind === 'collection' ? (
        <div className="import-panel__done">
          <p className="import-panel__message">Imported &quot;{result.name}&quot;</p>
          <Button variant="ghost" size="sm" onClick={onShow}>
            Show in Collections
          </Button>
        </div>
      ) : (
        <p className="import-panel__message">Opened as a new request</p>
      )}
      {result.report.length > 0 && (
        <>
          <h3 className="import-panel__report-title">Not carried over ({result.report.length})</h3>
          <ul className="import-panel__report">
            {result.report.map((n, i) => (
              <li key={i}>{n.path === '' ? n.message : `${n.path} — ${n.message}`}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
