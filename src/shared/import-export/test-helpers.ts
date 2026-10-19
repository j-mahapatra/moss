import type { Collection } from '../types'

const scrub = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(scrub)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'id' ? '<id>' : scrub(v)])
    )
  }
  return value
}

/** Deep copy of the collection with every `id` replaced by `'<id>'`, for exact comparisons. */
export function withoutIds(c: Collection): unknown {
  return scrub(c)
}
