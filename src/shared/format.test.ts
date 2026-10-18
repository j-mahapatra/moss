import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration } from './format'

describe('formatBytes', () => {
  it('formats units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(3174)).toBe('3.1 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('formatDuration', () => {
  it('uses ms under a second and s above', () => {
    expect(formatDuration(142)).toBe('142 ms')
    expect(formatDuration(999.6)).toBe('1.00 s')
    expect(formatDuration(1240)).toBe('1.24 s')
  })
})
