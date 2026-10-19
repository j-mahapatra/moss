import type { IpcMain } from 'electron'
import { ipcContract } from '../shared/ipc-contract'
import { prepareRequest } from '../shared/prepare'
import type { VariableScope } from '../shared/variables'
import type { RunnerSupervisor } from './runner-supervisor'
import type { CollectionsRepo } from './storage/collections-repo'
import type { EnvironmentsRepo } from './storage/environments-repo'
import type { SettingsRepo } from './storage/settings-repo'

export interface IpcDeps {
  supervisor: Pick<RunnerSupervisor, 'send' | 'cancel'>
  scope: (ids: { collectionId?: string; environmentId?: string }) => Promise<VariableScope>
  pickFile: () => Promise<string | null>
  saveFile: (base64: string, name: string) => Promise<boolean>
  collections: Pick<CollectionsRepo, 'list' | 'save' | 'delete'>
  settings: Pick<SettingsRepo, 'get' | 'set'>
  environments: Pick<EnvironmentsRepo, 'list' | 'save' | 'delete'>
}

// Invalid input throws a ZodError (a programming error); Electron rejects the renderer promise.
export function registerIpc(ipcMain: Pick<IpcMain, 'handle'>, deps: IpcDeps): void {
  ipcMain.handle('request:send', async (_event, raw) => {
    const { requestId, request, collectionId, environmentId } =
      ipcContract['request:send'].input.parse(raw)
    let scope: VariableScope
    try {
      scope = await deps.scope({ collectionId, environmentId })
    } catch {
      return {
        ok: false as const,
        error: {
          kind: 'unknown' as const,
          message: 'Request failed: could not load variables'
        }
      }
    }
    const prepared = prepareRequest(request, scope)
    if (!prepared.ok) return { ok: false as const, error: prepared.error }
    return deps.supervisor.send(requestId, prepared.request)
  })

  ipcMain.handle('request:cancel', (_event, raw) => {
    const { requestId } = ipcContract['request:cancel'].input.parse(raw)
    deps.supervisor.cancel(requestId)
  })

  ipcMain.handle('dialog:pick-file', (_event, raw) => {
    ipcContract['dialog:pick-file'].input.parse(raw)
    return deps.pickFile()
  })

  ipcMain.handle('response:save', (_event, raw) => {
    const { bodyBase64, suggestedName } = ipcContract['response:save'].input.parse(raw)
    return deps.saveFile(bodyBase64, suggestedName)
  })

  ipcMain.handle('collections:list', (_event, raw) => {
    ipcContract['collections:list'].input.parse(raw)
    return deps.collections.list()
  })

  ipcMain.handle('collections:save', async (_event, raw) => {
    await deps.collections.save(ipcContract['collections:save'].input.parse(raw))
  })

  ipcMain.handle('collections:delete', async (_event, raw) => {
    const { id } = ipcContract['collections:delete'].input.parse(raw)
    await deps.collections.delete(id)
  })

  ipcMain.handle('settings:get', (_event, raw) => {
    ipcContract['settings:get'].input.parse(raw)
    return deps.settings.get()
  })

  ipcMain.handle('settings:set', async (_event, raw) => {
    await deps.settings.set(ipcContract['settings:set'].input.parse(raw))
  })

  ipcMain.handle('environments:list', (_event, raw) => {
    ipcContract['environments:list'].input.parse(raw)
    return deps.environments.list()
  })

  ipcMain.handle('environments:save', async (_event, raw) => {
    await deps.environments.save(ipcContract['environments:save'].input.parse(raw))
  })

  ipcMain.handle('environments:delete', async (_event, raw) => {
    const { id } = ipcContract['environments:delete'].input.parse(raw)
    await deps.environments.delete(id)
  })
}
