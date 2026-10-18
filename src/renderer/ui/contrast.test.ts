import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import { palette, type TokenName } from './tokens'

const requiredPairs: [TokenName, TokenName][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text-muted', 'surface'],
  ['accent-text', 'accent'],
  ['status-2xx', 'surface'],
  ['status-3xx', 'surface'],
  ['status-4xx', 'surface'],
  ['status-5xx', 'surface'],
  ['var-unresolved', 'surface'],
  ['var-resolved', 'surface'],
  ['text', 'notice-warning-bg'],
  ['text', 'notice-danger-bg'],
  ['status-4xx', 'notice-warning-bg'],
  ['danger', 'notice-danger-bg']
]

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('is symmetric and 1 for identical colors', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#3a7f5c', '#3a7f5c')).toBeCloseTo(1, 5)
  })

  it('accepts 3-digit hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5)
  })
})

describe.each(['light', 'dark'] as const)('%s theme meets WCAG AA', (theme) => {
  it.each(requiredPairs)('%s on %s >= 4.5', (fg, bg) => {
    expect(contrastRatio(palette[theme][fg], palette[theme][bg])).toBeGreaterThanOrEqual(4.5)
  })
})
