import { useMemo } from 'react'
import type { PaletteItem } from '../../../shared/fuzzy'
import { useWorkspace, useWorkspaceStore } from '../../state/workspace-hooks'
import { CommandPalette } from '../../ui/CommandPalette'
import { useReturnFocus } from '../shell/useReturnFocus'
import { buildPaletteItems } from './palette-items'

const NO_ITEMS: PaletteItem[] = []

/** The app's command palette, opened by ⌘K (Ctrl+K off macOS) or the top-bar search field. */
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

  // ⌘K has no trigger for Radix to return focus to.
  const onCloseAutoFocus = useReturnFocus(open)

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
