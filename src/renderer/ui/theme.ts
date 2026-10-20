import type { ThemePref } from '../../shared/types'

const QUERY = '(prefers-color-scheme: dark)'
/** localStorage key mirroring the saved theme, so first paint matches before settings load. */
const THEME_MIRROR_KEY = 'moss.theme'

/** The mirrored preference, or null when absent, unknown or storage is unavailable. */
function readMirror(): ThemePref | null {
  try {
    const v = localStorage.getItem(THEME_MIRROR_KEY)
    return v === 'system' || v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function writeMirror(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, pref)
  } catch {
    // A per-viewer convenience only; settings.json stays the source of truth.
  }
}

/**
 * Sets `<html data-theme>` from the preference: 'light' / 'dark' directly, 'system' from the
 * OS color scheme. OS changes are followed only while the preference is 'system'.
 * First paint uses the theme mirrored in localStorage (if any), so a saved light or dark theme
 * doesn't flash before settings load. `refresh()` re-reads the preference, which then wins, and
 * mirrors it; `dispose()` stops following OS changes.
 */
export function applyTheme(getPref: () => ThemePref): { refresh(): void; dispose(): void } {
  const mql = window.matchMedia(QUERY)
  let pref = readMirror() ?? getPref()
  const paint = (): void => {
    const dark = pref === 'system' ? mql.matches : pref === 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }
  const refresh = (): void => {
    pref = getPref()
    writeMirror(pref)
    paint()
  }
  paint()
  mql.addEventListener('change', paint)
  return { refresh, dispose: () => mql.removeEventListener('change', paint) }
}
