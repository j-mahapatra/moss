import type { ThemePref } from '../../shared/types'

const QUERY = '(prefers-color-scheme: dark)'

/**
 * Sets `<html data-theme>` from the preference: 'light' / 'dark' directly, 'system' from the
 * OS color scheme. OS changes are followed only while the preference is 'system'.
 * `refresh()` re-reads the preference; `dispose()` stops following OS changes.
 */
export function applyTheme(getPref: () => ThemePref): { refresh(): void; dispose(): void } {
  const mql = window.matchMedia(QUERY)
  const refresh = (): void => {
    const pref = getPref()
    const dark = pref === 'system' ? mql.matches : pref === 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }
  refresh()
  mql.addEventListener('change', refresh)
  return { refresh, dispose: () => mql.removeEventListener('change', refresh) }
}
