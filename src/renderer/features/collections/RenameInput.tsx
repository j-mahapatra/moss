import { useEffect, useRef } from 'react'
import { Input } from '../../ui'

type Props = {
  initial: string
  onCommit(name: string): void
  /** `esc` returns focus to the row; `blur` must not steal it back. */
  onCancel(reason: 'esc' | 'blur'): void
}

/** Inline rename field: Enter commits, Esc and blur cancel. */
export function RenameInput({ initial, onCommit, onCancel }: Props): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (fn: () => void): void => {
    if (done.current) return
    done.current = true
    fn()
  }
  return (
    <Input
      ref={ref}
      className="tree-row__rename"
      aria-label="Rename"
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(() => onCommit(e.currentTarget.value))
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(() => onCancel('esc'))
        }
      }}
      onBlur={() => finish(() => onCancel('blur'))}
    />
  )
}
