const QUERY = '(prefers-color-scheme: dark)'

/**
 * Sets `<html data-theme>` from the OS color scheme and keeps it in sync.
 * Returns a function that stops following OS changes.
 */
export function applyTheme(): () => void {
  const mql = window.matchMedia(QUERY)
  const set = (dark: boolean): void => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }
  set(mql.matches)
  const onChange = (e: Pick<MediaQueryListEvent, 'matches'>): void => set(e.matches)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
