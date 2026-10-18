import * as RSelect from '@radix-ui/react-select'
import './Select.css'

export type SelectOption = { value: string; label: string }

export type SelectProps = {
  value: string
  onValueChange(value: string): void
  options: SelectOption[]
  'aria-label': string
}

function Chevron(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Select({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel
}: SelectProps): React.JSX.Element {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange}>
      <RSelect.Trigger className="moss-select" aria-label={ariaLabel}>
        <RSelect.Value />
        <RSelect.Icon className="moss-select__icon">
          <Chevron />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="moss-select__content" position="popper" sideOffset={4}>
          <RSelect.Viewport className="moss-select__viewport">
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} className="moss-select__item">
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}
