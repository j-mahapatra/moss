import { useState } from 'react'
import type { Variable } from '../../shared/types'
import { LockIcon } from '../features/shell/icons'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { Input } from './Input'
import { SecretInput } from './SecretInput'
import './KeyValueGrid.css'

/** Rows are KeyValue; `secret` is only read and written when `secretColumn` is set. */
export type KeyValueGridProps = {
  rows: Variable[]
  onChange(rows: Variable[]): void
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** Adds a per-row "mark secret" toggle; secret rows render their value masked. */
  secretColumn?: boolean
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
  valuePlaceholder = 'Value',
  secretColumn = false
}: KeyValueGridProps): React.JSX.Element {
  // Bumped when rows shift position, so a revealed secret never carries over to another row.
  const [generation, setGeneration] = useState(0)
  const update = (index: number, patch: Partial<Variable>): void => {
    if (index === rows.length) {
      onChange([...rows, { key: '', value: '', enabled: true, ...patch }])
    } else {
      onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    }
  }
  const remove = (index: number): void => {
    setGeneration((g) => g + 1)
    onChange(rows.filter((_, i) => i !== index))
  }
  const toggleSecret = (index: number): void =>
    onChange(
      rows.map((row, i) => {
        if (i !== index) return row
        if (!row.secret) return { ...row, secret: true }
        // Unmarked rows drop the flag rather than storing `secret: false`.
        const rest: Variable = { ...row }
        delete rest.secret
        return rest
      })
    )

  const all: (Variable & { trailing: boolean })[] = [
    ...rows.map((row) => ({ ...row, trailing: false })),
    { key: '', value: '', enabled: true, trailing: true }
  ]

  return (
    <div className={cx('moss-kv', secretColumn && 'moss-kv--secret')}>
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
            {secretColumn && !row.trailing && row.secret ? (
              <SecretInput
                key={generation}
                label={`Value ${n}`}
                placeholder={valuePlaceholder}
                value={row.value}
                onChange={(value) => update(index, { value })}
              />
            ) : (
              <Input
                mono
                aria-label={`Value ${n}`}
                placeholder={valuePlaceholder}
                value={row.value}
                spellCheck={false}
                onChange={(e) => update(index, { value: e.target.value })}
              />
            )}
            {secretColumn &&
              (row.trailing ? (
                <span className="moss-kv__spacer" />
              ) : (
                <IconButton
                  className="moss-kv__lock"
                  label={`Mark ${row.key.trim() || 'row'} secret`}
                  aria-pressed={row.secret === true}
                  onClick={() => toggleSecret(index)}
                >
                  <LockIcon />
                </IconButton>
              ))}
            {row.trailing ? (
              <span className="moss-kv__spacer" />
            ) : (
              <IconButton
                className="moss-kv__remove"
                label="Remove row"
                onClick={() => remove(index)}
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
