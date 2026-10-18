import { afterEach, describe, expect, it, vi } from 'vitest'
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
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('uses light when the OS prefers light', () => {
    fakeMatchMedia(false)
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('follows OS changes and stops after cleanup', () => {
    const mm = fakeMatchMedia(false)
    const stop = applyTheme()
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    mm.set(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
    expect(mm.listeners.size).toBe(0)
    mm.set(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
