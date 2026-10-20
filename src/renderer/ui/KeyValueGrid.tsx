import { useLayoutEffect, useRef, useState } from 'react'
import type { Variable } from '../../shared/types'
import { LockIcon } from './icons'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { Input } from './Input'
import { SecretInput } from './SecretInput'
import './KeyValueGrid.css'

/** Rows are KeyValue; `secret` is only read and written when `secretColumn` is set. */
export type KeyValueGridProps = {
  rows: Variable[]
  /**
   * Receives the next rows. The parent must store this exact array and pass it back as `rows`:
   * the grid recognises its own edits by identity, so a cloned or rebuilt array reads as an
   * outside change and re-masks every revealed secret.
   */
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
  // `generation` keys the secret inputs. It is bumped when a row is removed and whenever `rows`
  // arrives from outside this grid's own edits (discard, reload, store changes), so a revealed
  // secret never carries over to whatever row lands in its slot.
  const [emitted, setEmitted] = useState<Variable[] | null>(null)
  const [seen, setSeen] = useState({ rows, generation: 0 })
  let generation = seen.generation
  if (seen.rows !== rows) {
    if (rows !== emitted) generation += 1
    setSeen({ rows, generation })
  }
  // Toggling a row's secret flag swaps its value input for another component. If that input had
  // focus, the replacement takes it (and the selection) over on the next render, which `emit`
  // always causes; the request is consumed there whether or not the parent took the change.
  const root = useRef<HTMLDivElement>(null)
  const refocus = useRef<{ label: string; start: number | null; end: number | null } | null>(null)
  useLayoutEffect(() => {
    const target = refocus.current
    if (!target) return
    refocus.current = null
    const input = root.current?.querySelector<HTMLInputElement>(
      `input[aria-label="${target.label}"]`
    )
    if (!input) return
    input.focus()
    if (target.start !== null && target.end !== null) {
      input.setSelectionRange(target.start, target.end)
    }
  })
  const emit = (next: Variable[]): void => {
    setEmitted(next)
    onChange(next)
  }
  const update = (index: number, patch: Partial<Variable>): void => {
    if (index === rows.length) {
      emit([...rows, { key: '', value: '', enabled: true, ...patch }])
    } else {
      emit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    }
  }
  const remove = (index: number): void => {
    setSeen((s) => ({ ...s, generation: s.generation + 1 }))
    emit(rows.filter((_, i) => i !== index))
  }
  const toggleSecret = (index: number): void => {
    const label = `Value ${index + 1}`
    const active = document.activeElement
    refocus.current =
      active instanceof HTMLInputElement &&
      active.getAttribute('aria-label') === label &&
      root.current?.contains(active)
        ? { label, start: active.selectionStart, end: active.selectionEnd }
        : null
    emit(
      rows.map((row, i) => {
        if (i !== index) return row
        if (!row.secret) return { ...row, secret: true }
        // Unmarked rows drop the flag rather than storing `secret: false`.
        const rest: Variable = { ...row }
        delete rest.secret
        return rest
      })
    )
  }

  const all: (Variable & { trailing: boolean })[] = [
    ...rows.map((row) => ({ ...row, trailing: false })),
    { key: '', value: '', enabled: true, trailing: true }
  ]

  return (
    <div ref={root} className={cx('moss-kv', secretColumn && 'moss-kv--secret')}>
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
