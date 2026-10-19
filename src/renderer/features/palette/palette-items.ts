import type { PaletteItem } from '../../../shared/fuzzy'
import type { Collection, Item, ThemePref } from '../../../shared/types'
import { byName } from '../../state/slices/doc-queue'
import type { WorkspaceState } from '../../state/workspace'
import { modKey } from '../../ui/platform'

/** The store fields the palette lists. */
export type PaletteState = Pick<
  WorkspaceState,
  'theme' | 'environments' | 'activeEnvironmentId' | 'collections'
>

/** The store actions palette items run. */
export type PaletteActions = Pick<
  WorkspaceState,
  | 'newRequest'
  | 'openRequest'
  | 'setConfirmDiscard'
  | 'showPanel'
  | 'setTheme'
  | 'setActiveEnvironment'
>

const THEMES: { pref: ThemePref; label: string }[] = [
  { pref: 'system', label: 'Theme: Match system' },
  { pref: 'light', label: 'Theme: Light' },
  { pref: 'dark', label: 'Theme: Dark' }
]

/** Every palette entry, grouped and ordered: Commands, Environments, then Requests. */
export function buildPaletteItems(state: PaletteState, actions: PaletteActions): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: 'command:new-request',
      group: 'Commands',
      label: 'New request',
      hint: modKey('N'),
      run: () => {
        if (actions.newRequest() === 'confirm-discard') actions.setConfirmDiscard({ then: 'new' })
      }
    },
    {
      id: 'command:import',
      group: 'Commands',
      label: 'Import…',
      run: () => actions.showPanel('import')
    },
    ...THEMES.map(({ pref, label }): PaletteItem => ({
      id: `command:theme-${pref}`,
      group: 'Commands',
      label,
      ...(state.theme === pref ? { badge: 'Current' } : {}),
      run: () => actions.setTheme(pref)
    }))
  ]

  for (const env of [...state.environments].sort(byName)) {
    items.push({
      id: `environment:${env.id}`,
      group: 'Environments',
      label: `Use environment: ${env.name}`,
      ...(env.id === state.activeEnvironmentId ? { badge: 'Active' } : {}),
      run: () => actions.setActiveEnvironment(env.id)
    })
  }
  items.push({
    id: 'environment:none',
    group: 'Environments',
    label: 'Use no environment',
    run: () => actions.setActiveEnvironment(null)
  })

  for (const collection of state.collections) pushRequests(items, collection, actions)
  return items
}

/** Appends the collection's requests depth-first, in tree order. */
function pushRequests(out: PaletteItem[], collection: Collection, actions: PaletteActions): void {
  const walk = (list: Item[], path: string[]): void => {
    for (const item of list) {
      if (item.kind === 'folder') {
        walk(item.items, [...path, item.name])
        continue
      }
      const ref = { collectionId: collection.id, requestId: item.id }
      out.push({
        id: `request:${collection.id}:${item.id}`,
        group: 'Requests',
        label: item.name,
        detail: path.join(' / '),
        badge: item.method,
        run: () => {
          if (actions.openRequest(ref) === 'confirm-discard') {
            actions.setConfirmDiscard({ then: 'open', ref })
          }
        }
      })
    }
  }
  walk(collection.items, [collection.name])
}
