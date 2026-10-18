import type { FormField } from '../../../shared/types'
import { Button, IconButton, Input } from '../../ui'
import './FormDataGrid.css'

type Props = {
  rows: FormField[]
  onChange(rows: FormField[]): void
  pickFile(): Promise<string | null>
}

const blank = (): FormField => ({ kind: 'text', key: '', value: '', enabled: true })

function RemoveIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
    </svg>
  )
}

/** Key / text-or-file rows for multipart bodies, with one trailing empty row. */
export function FormDataGrid({ rows, onChange, pickFile }: Props): React.JSX.Element {
  const set = (index: number, next: FormField): void => {
    onChange(index === rows.length ? [...rows, next] : rows.map((r, i) => (i === index ? next : r)))
  }
  const all = [...rows, blank()]

  return (
    <div className="moss-fd">
      {all.map((row, index) => {
        const n = index + 1
        const trailing = index === rows.length
        return (
          <div key={index} className="moss-fd__row">
            <input
              type="checkbox"
              className="moss-fd__check"
              aria-label={`Enable row ${n}`}
              checked={!trailing && row.enabled}
              disabled={trailing}
              onChange={(e) => set(index, { ...row, enabled: e.target.checked })}
            />
            <Input
              mono
              aria-label={`Key ${n}`}
              placeholder="Key"
              spellCheck={false}
              value={row.key}
              onChange={(e) => set(index, { ...row, key: e.target.value })}
            />
            <div className="moss-fd__kind" role="group" aria-label={`Row ${n} type`}>
              <button
                type="button"
                aria-pressed={row.kind === 'text'}
                onClick={() =>
                  row.kind !== 'text' &&
                  set(index, { kind: 'text', key: row.key, value: '', enabled: row.enabled })
                }
              >
                Text
              </button>
              <button
                type="button"
                aria-pressed={row.kind === 'file'}
                onClick={() =>
                  row.kind !== 'file' &&
                  set(index, { kind: 'file', key: row.key, filePath: '', enabled: row.enabled })
                }
              >
                File
              </button>
            </div>
            {row.kind === 'text' ? (
              <Input
                mono
                aria-label={`Value ${n}`}
                placeholder="Value"
                spellCheck={false}
                value={row.value}
                onChange={(e) => set(index, { ...row, value: e.target.value })}
              />
            ) : (
              <div className="moss-fd__file">
                <span className="moss-fd__path" title={row.filePath}>
                  {row.filePath || 'No file chosen'}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void pickFile().then((path) => {
                      if (path) set(index, { ...row, filePath: path })
                    })
                  }}
                >
                  Choose file…
                </Button>
              </div>
            )}
            {trailing ? (
              <span className="moss-fd__spacer" />
            ) : (
              <IconButton
                label="Remove row"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <RemoveIcon />
              </IconButton>
            )}
          </div>
        )
      })}
    </div>
  )
}
