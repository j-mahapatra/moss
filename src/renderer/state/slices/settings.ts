import type { Settings } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import type { AddNotice } from './notices'
import type { SliceCtx } from './ctx'

export const SPLIT_DEFAULT = 0.5
const SPLIT_LOW = 0.2
const SPLIT_HIGH = 0.8
const SAVE_DELAY_MS = 300

export const clampSplit = (r: number): number => Math.min(SPLIT_HIGH, Math.max(SPLIT_LOW, r))

export function createSettings(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice
): {
  applySettings(s: Settings): void
  slice: Pick<WorkspaceState, 'split' | 'navigatorCollapsed' | 'setSplit' | 'toggleNavigator'>
} {
  // Task 4 replaces this with real store state; until then it is carried through unchanged.
  let activeEnvironmentId: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  // Debounced: only the last split/collapsed values within 300 ms are written.
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { split, navigatorCollapsed } = get()
      Promise.resolve()
        .then(() =>
          api['settings:set']({ schemaVersion: 1, split, navigatorCollapsed, activeEnvironmentId })
        )
        .catch(() => addNotice('warning', "Couldn't save settings."))
    }, SAVE_DELAY_MS)
  }

  return {
    // Used by init; deliberately does not schedule a save.
    applySettings: (s) => {
      activeEnvironmentId = s.activeEnvironmentId
      set({ split: clampSplit(s.split), navigatorCollapsed: s.navigatorCollapsed })
    },
    slice: {
      split: SPLIT_DEFAULT,
      navigatorCollapsed: false,
      setSplit: (r) => {
        set({ split: clampSplit(r) })
        schedule()
      },
      toggleNavigator: () => {
        set((s) => ({ navigatorCollapsed: !s.navigatorCollapsed }))
        schedule()
      }
    }
  }
}
