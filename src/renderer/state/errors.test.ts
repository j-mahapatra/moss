import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it("uses an Error's message and stringifies anything else", () => {
    expect(errorMessage(new Error('disk full'))).toBe('disk full')
    expect(errorMessage('nope')).toBe('nope')
    expect(errorMessage(42)).toBe('42')
  })
})
