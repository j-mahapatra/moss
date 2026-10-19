import { useEffect } from 'react'
import { useWorkspaceStore } from '../../state/workspace-hooks'

const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.platform)
const anyOverlay = (): boolean => !!document.querySelector('[role="dialog"],[role="menu"]')

export function useShortcuts(): void {
  const store = useWorkspaceStore()
  useEffect(() => {
    const overlayOpen = (e: KeyboardEvent): boolean => e.defaultPrevented || anyOverlay()
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'Enter') {
        if (overlayOpen(e)) return
        e.preventDefault()
        if (e.repeat) return
        void store.getState().send()
      } else if (e.key === 'Escape') {
        if (overlayOpen(e)) return
        if (!store.getState().inFlight) return
        e.preventDefault()
        store.getState().cancel()
      } else if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        if (anyOverlay()) return
        document.querySelector<HTMLElement>('[data-url-input]')?.focus()
      } else if (mod && ['s', 'n', 'b'].includes(e.key.toLowerCase())) {
        if (overlayOpen(e)) return
        e.preventDefault()
        if (e.repeat) return
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
    // ⌘K (Ctrl+K off macOS) toggles the palette. Capture phase, so editors such as CodeMirror
    // never see it; it opens over nothing else but closes the palette itself.
    const onPaletteKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey) return
      if (!(isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return
      const st = store.getState()
      if (!st.ui.paletteOpen && anyOverlay()) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      st.setPaletteOpen(!st.ui.paletteOpen)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('keydown', onPaletteKey, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keydown', onPaletteKey, true)
    }
  }, [store])
}
