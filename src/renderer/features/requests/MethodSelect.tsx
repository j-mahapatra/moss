import type { HttpMethod } from '../../../shared/types'
import { Select } from '../../ui'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export function MethodSelect({
  value,
  onChange
}: {
  value: HttpMethod
  onChange(method: HttpMethod): void
}): React.JSX.Element {
  return (
    <Select
      aria-label="Method"
      value={value}
      onValueChange={(v) => onChange(v as HttpMethod)}
      options={METHODS.map((m) => ({ value: m, label: m }))}
    />
  )
}
