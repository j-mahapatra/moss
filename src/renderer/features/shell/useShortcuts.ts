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
      } else if (mod && ['s', 'n', 'b'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        if (e.repeat || document.querySelector('[role="dialog"]')) return
        const st = store.getState()
        const key = e.key.toLowerCase()
        if (key === 'b') st.toggleNavigator()
        else if (key === 'n') {
          if (st.newRequest() === 'confirm-discard') st.setConfirmDiscard({ then: 'new' })
        } else {
          void st.saveActive().then((r) => {
            if (r === 'needs-target') store.getState().openSaveDialog(true)
          })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])
}
