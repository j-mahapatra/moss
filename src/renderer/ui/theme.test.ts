import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ThemePref } from '../../shared/types'
import { applyTheme } from './theme'

type Listener = (e: { matches: boolean }) => void

function fakeMatchMedia(initialDark: boolean): {
  set(dark: boolean): void
  listeners: Set<Listener>
} {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l)
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      expect(query).toBe('(prefers-color-scheme: dark)')
      return mql
    })
  )
  return {
    listeners,
    set(dark) {
      mql.matches = dark
      listeners.forEach((l) => l({ matches: dark }))
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('applyTheme', () => {
  it('uses dark when the OS prefers dark', () => {
    const mm = fakeMatchMedia(true)
    const t = applyTheme(() => 'system')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(mm.listeners.size).toBe(1)
    t.dispose()
    expect(mm.listeners.size).toBe(0)
  })

  it('uses light when the OS prefers light', () => {
    const mm = fakeMatchMedia(false)
    const t = applyTheme(() => 'system')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(mm.listeners.size).toBe(1)
    t.dispose()
    expect(mm.listeners.size).toBe(0)
  })

  it('follows OS changes while system, and stops after dispose', () => {
    const mm = fakeMatchMedia(false)
    const t = applyTheme(() => 'system')
    expect(mm.listeners.size).toBe(1)
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    mm.set(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    t.dispose()
    expect(mm.listeners.size).toBe(0)
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('ignores OS changes while the preference is light or dark', () => {
    const mm = fakeMatchMedia(false)
    const light = applyTheme(() => 'light')
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    light.dispose()
    expect(mm.listeners.size).toBe(0)
    vi.unstubAllGlobals()
    const mm2 = fakeMatchMedia(true)
    const dark = applyTheme(() => 'dark')
    mm2.set(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
    dark.dispose()
    expect(mm2.listeners.size).toBe(0)
  })

  it('refresh re-reads the preference', () => {
    fakeMatchMedia(true)
    let pref: ThemePref = 'system'
    const t = applyTheme(() => pref)
    expect(document.documentElement.dataset.theme).toBe('dark')
    pref = 'light'
    t.refresh()
    expect(document.documentElement.dataset.theme).toBe('light')
    pref = 'system'
    t.refresh()
    expect(document.documentElement.dataset.theme).toBe('dark')
    t.dispose()
  })
})

describe('theme mirror', () => {
  it('first paint uses the mirrored theme until refresh reads the preference', () => {
    const mm = fakeMatchMedia(false)
    localStorage.setItem('moss.theme', 'dark')
    let pref: ThemePref = 'system'
    const t = applyTheme(() => pref)
    expect(document.documentElement.dataset.theme).toBe('dark')
    // An OS change before the first refresh keeps the mirrored choice.
    mm.set(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
    pref = 'light'
    t.refresh()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('moss.theme')).toBe('light')
    t.dispose()
    expect(mm.listeners.size).toBe(0)
  })

  it('settings win on refresh: a mirrored dark yields to a loaded system preference', () => {
    const mm = fakeMatchMedia(false)
    localStorage.setItem('moss.theme', 'dark')
    const t = applyTheme(() => 'system')
    expect(document.documentElement.dataset.theme).toBe('dark')
    t.refresh()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('moss.theme')).toBe('system')
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    t.dispose()
  })

  it('ignores an unknown mirrored value', () => {
    fakeMatchMedia(true)
    localStorage.setItem('moss.theme', 'purple')
    const t = applyTheme(() => 'light')
    expect(document.documentElement.dataset.theme).toBe('light')
    t.dispose()
  })

  it('works without storage: reads and writes that throw are ignored', () => {
    const mm = fakeMatchMedia(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    let pref: ThemePref = 'system'
    const t = applyTheme(() => pref)
    expect(document.documentElement.dataset.theme).toBe('dark')
    pref = 'light'
    expect(() => t.refresh()).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
    t.dispose()
    expect(mm.listeners.size).toBe(0)
  })
})
