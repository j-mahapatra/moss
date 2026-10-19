import type { Settings } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import type { AddNotice } from './notices'
import type { SliceCtx } from './ctx'

export const SPLIT_DEFAULT = 0.5
const SPLIT_LOW = 0.2
const SPLIT_HIGH = 0.8
const SAVE_DELAY_MS = 300

export const clampSplit = (r: number): number => Math.min(SPLIT_HIGH, Math.max(SPLIT_LOW, r))

type Field = 'split' | 'navigatorCollapsed' | 'activeEnvironmentId' | 'theme'

export function createSettings(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice
): {
  /** Called by init when it starts loading: saves wait until `applySettings` runs. */
  beginLoad(): void
  /**
   * Applies loaded settings (null = load failed), keeping fields the user changed while
   * loading. An active id that is not in `environments` is dropped and the drop persisted,
   * unless the environments failed to load (`envsLoaded` false): then the id cannot be
   * checked, so it is kept privately and written back unchanged until the user picks another.
   */
  applySettings(s: Settings | null, envsLoaded: boolean): void
  slice: Pick<
    WorkspaceState,
    | 'split'
    | 'navigatorCollapsed'
    | 'activeEnvironmentId'
    | 'theme'
    | 'setSplit'
    | 'setTheme'
    | 'toggleNavigator'
    | 'setActiveEnvironment'
    | 'flushSettings'
  >
} {
  let loading = false
  /** Fields changed while loading; the loaded values must not overwrite them. */
  const dirtyFields = new Set<Field>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | null = null
  /** Saved active id we could not resolve (environments failed to load); undefined = none. */
  let unresolvedId: string | null | undefined

  const write = (): Promise<void> => {
    const { split, navigatorCollapsed, theme } = get()
    const activeEnvironmentId =
      unresolvedId !== undefined ? unresolvedId : get().activeEnvironmentId
    let sent: Promise<void>
    try {
      // Called synchronously so a flush from `beforeunload` reaches IPC before the page goes.
      sent = Promise.resolve(
        api['settings:set']({
          schemaVersion: 1,
          split,
          navigatorCollapsed,
          activeEnvironmentId,
          theme
        })
      )
    } catch (err) {
      sent = Promise.reject(err)
    }
    const p = sent.catch(() => addNotice('warning', "Couldn't save settings."))
    inFlight = p
    void p.then(() => {
      if (inFlight === p) inFlight = null
    })
    return p
  }

  // Debounced: only the last values within 300 ms are written. While loading, nothing is
  // written; applySettings schedules the merged result instead.
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!loading) void write()
    }, SAVE_DELAY_MS)
  }

  const change = (field: Field, patch: Partial<WorkspaceState>): void => {
    if (loading) dirtyFields.add(field)
    if (field === 'activeEnvironmentId') unresolvedId = undefined
    set(patch)
    schedule()
  }

  return {
    beginLoad: () => {
      loading = true
    },

    applySettings: (s, envsLoaded) => {
      loading = false
      let save = dirtyFields.size > 0
      if (s) {
        const patch: Partial<WorkspaceState> = {}
        if (!dirtyFields.has('split')) patch.split = clampSplit(s.split)
        if (!dirtyFields.has('navigatorCollapsed')) patch.navigatorCollapsed = s.navigatorCollapsed
        if (!dirtyFields.has('theme')) patch.theme = s.theme
        if (!dirtyFields.has('activeEnvironmentId')) {
          const id = s.activeEnvironmentId
          if (!envsLoaded) {
            unresolvedId = id
            patch.activeEnvironmentId = null
          } else {
            const exists = id === null || get().environments.some((e) => e.id === id)
            patch.activeEnvironmentId = exists ? id : null
            if (!exists) save = true
          }
        }
        set(patch)
      }
      dirtyFields.clear()
      if (save) schedule()
    },

    slice: {
      split: SPLIT_DEFAULT,
      navigatorCollapsed: false,
      activeEnvironmentId: null,
      theme: 'system',
      setSplit: (r) => change('split', { split: clampSplit(r) }),
      setTheme: (pref) => {
        if (!loading && pref === get().theme) return
        change('theme', { theme: pref })
      },
      toggleNavigator: () =>
        change('navigatorCollapsed', { navigatorCollapsed: !get().navigatorCollapsed }),
      setActiveEnvironment: (id) => {
        if (id !== null && !get().environments.some((e) => e.id === id)) return
        // While loading, the current value is only a default: record the choice anyway.
        if (!loading && id === get().activeEnvironmentId) return
        change('activeEnvironmentId', { activeEnvironmentId: id })
      },
      flushSettings: () => {
        if (timer === undefined || loading) return inFlight ?? Promise.resolve()
        clearTimeout(timer)
        timer = undefined
        return write()
      }
    }
  }
}
