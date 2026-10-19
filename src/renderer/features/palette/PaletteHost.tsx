import { useLayoutEffect, useMemo, useRef } from 'react'
import type { PaletteItem } from '../../../shared/fuzzy'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import { CommandPalette } from '../../ui/CommandPalette'
import { buildPaletteItems } from './palette-items'

const NO_ITEMS: PaletteItem[] = []

/** The app's command palette, opened by ⌘K or the top-bar search field. */
export function PaletteHost(): React.JSX.Element {
  const store = useWorkspaceStore()
  const open = useWorkspace((s) => s.ui.paletteOpen)
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen)
  const theme = useWorkspace((s) => s.theme)
  const environments = useWorkspace((s) => s.environments)
  const activeEnvironmentId = useWorkspace((s) => s.activeEnvironmentId)
  const collections = useWorkspace((s) => s.collections)

  const items = useMemo(
    () =>
      open
        ? buildPaletteItems(
            { theme, environments, activeEnvironmentId, collections },
            store.getState()
          )
        : NO_ITEMS,
    [open, theme, environments, activeEnvironmentId, collections, store]
  )

  // ⌘K has no trigger for Radix to return focus to, so remember where focus was. A layout
  // effect runs before the dialog's focus scope moves focus into the palette.
  const returnFocus = useRef<Element | null>(null)
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement
  }, [open])

  const onCloseAutoFocus = (event: Event): void => {
    event.preventDefault()
    const target = returnFocus.current
    returnFocus.current = null
    // An action that placed focus itself (anywhere but <body>) keeps it.
    const at = document.activeElement
    if (at !== null && at !== document.body) return
    if (target instanceof HTMLElement && target.isConnected) target.focus()
  }

  return (
    <CommandPalette
      open={open}
      onOpenChange={setPaletteOpen}
      items={items}
      placeholder="Search requests, collections, commands…"
      onCloseAutoFocus={onCloseAutoFocus}
    />
  )
}
