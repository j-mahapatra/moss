import { useLayoutEffect, useRef, useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'
import { IconButton } from './IconButton'
import { Input } from './Input'
import './SecretInput.css'

export type SecretInputProps = {
  value: string
  onChange(value: string): void
  /** Accessible name of the input; the toggle reads "Show <label>" / "Hide <label>". */
  label: string
  placeholder?: string
  /** Id of the input, for a visible `<label htmlFor>`. */
  id?: string
}

/**
 * A masked text field with a per-field Show/Hide toggle. Reveal state belongs to this instance
 * and resets when `label` changes; callers key it to reset on a change of row or draft.
 */
export function SecretInput(props: SecretInputProps): React.JSX.Element {
  return <SecretField key={props.label} {...props} />
}

function SecretField({
  value,
  onChange,
  label,
  placeholder,
  id
}: SecretInputProps): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  // Uncontrolled on purpose: React mirrors a controlled input's value into the `value`
  // attribute, which would put the secret into the DOM markup. Only the property is set here.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.value !== value) el.value = value
  }, [value])

  return (
    <div className="moss-secret">
      <Input
        ref={ref}
        id={id}
        mono
        type={revealed ? 'text' : 'password'}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <IconButton
        className="moss-secret__toggle"
        label={`${revealed ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={revealed}
        onClick={() => setRevealed((r) => !r)}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </IconButton>
    </div>
  )
}
