import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMac, modKey } from './platform'

describe('platform', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses ⌘ on macOS', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    expect(isMac()).toBe(true)
    expect(modKey('K')).toBe('⌘K')
  })

  it('uses Ctrl+ elsewhere', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    expect(isMac()).toBe(false)
    expect(modKey('K')).toBe('Ctrl+K')
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64')
    expect(modKey('N')).toBe('Ctrl+N')
  })
})
