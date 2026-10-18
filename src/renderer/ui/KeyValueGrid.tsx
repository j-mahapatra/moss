import type { KeyValue } from '../../shared/types'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { Input } from './Input'
import './KeyValueGrid.css'

export type KeyValueGridProps = {
  rows: KeyValue[]
  onChange(rows: KeyValue[]): void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

function RemoveIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Editable key/value rows with one trailing empty row. Typing into the trailing row
 * appends a new enabled row; the trailing row itself is never part of `rows`.
 */
export function KeyValueGrid({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value'
}: KeyValueGridProps): React.JSX.Element {
  const update = (index: number, patch: Partial<KeyValue>): void => {
    if (index === rows.length) {
      onChange([...rows, { key: '', value: '', enabled: true, ...patch }])
    } else {
      onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    }
  }
  const remove = (index: number): void => onChange(rows.filter((_, i) => i !== index))

  const all: (KeyValue & { trailing: boolean })[] = [
    ...rows.map((row) => ({ ...row, trailing: false })),
    { key: '', value: '', enabled: true, trailing: true }
  ]

  return (
    <div className="moss-kv">
      {all.map((row, index) => {
        const n = index + 1
        // Index keys keep the focused input mounted when the trailing row becomes a real row.
        return (
          <div
            key={index}
            className={cx(
              'moss-kv__row',
              row.trailing && 'moss-kv__row--trailing',
              !row.trailing && !row.enabled && 'moss-kv__row--disabled'
            )}
          >
            <input
              type="checkbox"
              className="moss-kv__check"
              aria-label={`Enable row ${n}`}
              checked={!row.trailing && row.enabled}
              disabled={row.trailing}
              onChange={(e) => update(index, { enabled: e.target.checked })}
            />
            <Input
              mono
              aria-label={`Key ${n}`}
              placeholder={keyPlaceholder}
              value={row.key}
              spellCheck={false}
              onChange={(e) => update(index, { key: e.target.value })}
            />
            <Input
              mono
              aria-label={`Value ${n}`}
              placeholder={valuePlaceholder}
              value={row.value}
              spellCheck={false}
              onChange={(e) => update(index, { value: e.target.value })}
            />
            {row.trailing ? (
              <span className="moss-kv__spacer" />
            ) : (
              <IconButton label="Remove row" onClick={() => remove(index)}>
                <RemoveIcon />
              </IconButton>
            )}
          </div>
        )
      })}
    </div>
  )
}
