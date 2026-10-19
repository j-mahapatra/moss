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
  delete document.documentElement.dataset.theme
})

describe('applyTheme', () => {
  it('uses dark when the OS prefers dark', () => {
    fakeMatchMedia(true)
    applyTheme(() => 'system')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('uses light when the OS prefers light', () => {
    fakeMatchMedia(false)
    applyTheme(() => 'system')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('follows OS changes while system, and stops after dispose', () => {
    const mm = fakeMatchMedia(false)
    const t = applyTheme(() => 'system')
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
    applyTheme(() => 'light')
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    vi.unstubAllGlobals()
    const mm2 = fakeMatchMedia(true)
    applyTheme(() => 'dark')
    mm2.set(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
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
  })
})
