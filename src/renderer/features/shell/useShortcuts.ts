import { useEffect } from 'react'
import { useWorkspaceStore } from '../../state/workspace-hooks'

export function useShortcuts(): void {
  const store = useWorkspaceStore()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        if (e.repeat) return
        void store.getState().send()
      } else if (e.key === 'Escape') {
        if (!store.getState().inFlight) return
        e.preventDefault()
        store.getState().cancel()
      } else if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        document.querySelector<HTMLElement>('[data-url-input]')?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])
}
