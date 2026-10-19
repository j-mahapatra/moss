import { duplicateEnvironment, newEnvironment } from '../../../shared/environments'
import type { Environment } from '../../../shared/types'
import type { WorkspaceState } from '../workspace'
import { afterInit, errorMessage, type SliceCtx } from './ctx'
import { createDocQueue } from './doc-queue'
import type { AddNotice } from './notices'

export function createEnvironments(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice
): Pick<
  WorkspaceState,
  | 'environments'
  | 'createEnvironment'
  | 'duplicateEnvironmentById'
  | 'updateEnvironment'
  | 'deleteEnvironment'
> {
  /** Clears the active environment (and persists that) once it no longer exists. */
  const dropStaleActive = (): void => {
    const { activeEnvironmentId: id, environments } = get()
    if (id !== null && !environments.some((e) => e.id === id)) get().setActiveEnvironment(null)
  }

  const queue = createDocQueue<Environment>({
    read: () => get().environments,
    write: (environments) => set({ environments }),
    save: (e) => api['environments:save'](e),
    remove: (id) => api['environments:delete']({ id }),
    onSaveError: (e, err) => addNotice('danger', `Couldn't save "${e.name}": ${errorMessage(err)}`),
    onDeleteError: (e, err) =>
      addNotice('danger', `Couldn't delete "${e.name}": ${errorMessage(err)}`),
    onConfirmed: dropStaleActive
  })

  return {
    environments: [],
    createEnvironment: afterInit(get, async (name: string) => {
      const e = newEnvironment(name)
      return (await queue.create(e)) ? e : null
    }),
    duplicateEnvironmentById: afterInit(get, async (id: string) => {
      const source = get().environments.find((e) => e.id === id)
      if (!source) return null
      const copy = duplicateEnvironment(source)
      return (await queue.create(copy)) ? copy : null
    }),
    updateEnvironment: afterInit(get, async (id: string, fn: (e: Environment) => Environment) =>
      queue.update(id, fn)
    ),
    deleteEnvironment: afterInit(get, async (id: string) => queue.delete(id))
  }
}
