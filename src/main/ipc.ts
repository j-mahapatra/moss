import { randomUUID } from 'node:crypto'
import type { IpcMain } from 'electron'
import type { SendOutcome } from '../shared/types'
import { buildEntry } from './history-recorder'
import { ipcContract } from '../shared/ipc-contract'
import { prepareRequest } from '../shared/prepare'
import type { VariableScope } from '../shared/variables'
import type { ImportFileResult } from './import-files'
import type { RunnerSupervisor } from './runner-supervisor'
import type { CollectionsRepo } from './storage/collections-repo'
import type { EnvironmentsRepo } from './storage/environments-repo'
import type { HistoryRepo } from './storage/history-repo'
import type { SettingsRepo } from './storage/settings-repo'

export interface IpcDeps {
  supervisor: Pick<RunnerSupervisor, 'send' | 'cancel'>
  scope: (ids: { collectionId?: string; environmentId?: string }) => Promise<VariableScope>
  pickFile: () => Promise<string | null>
  saveFile: (base64: string, name: string) => Promise<boolean>
  /** null = cancelled. */
  openImportFile: () => Promise<ImportFileResult | null>
  /** false = cancelled. */
  saveExportFile: (name: string, text: string) => Promise<boolean>
  collections: Pick<CollectionsRepo, 'list' | 'save' | 'delete'>
  settings: Pick<SettingsRepo, 'get' | 'set'>
  environments: Pick<EnvironmentsRepo, 'list' | 'save' | 'delete'>
  history: Pick<HistoryRepo, 'list' | 'append' | 'delete' | 'clear'>
  /** One-time session warnings, added to the first successful collections:list. */
  startupWarnings?: string[]
  now?: () => number
}

export const HISTORY_WARNING = "Couldn't save this request to history."

// Invalid input throws a ZodError (a programming error); Electron rejects the renderer promise.
export function registerIpc(ipcMain: Pick<IpcMain, 'handle'>, deps: IpcDeps): void {
  const now = deps.now ?? Date.now
  let startupWarnings = deps.startupWarnings ?? []
  let historyWarned = false
  ipcMain.handle('request:send', async (_event, raw): Promise<SendOutcome> => {
    const { requestId, request, collectionId, environmentId } =
      ipcContract['request:send'].input.parse(raw)
    let scope: VariableScope
    try {
      scope = await deps.scope({ collectionId, environmentId })
    } catch {
      return {
        result: {
          ok: false,
          error: { kind: 'unknown', message: 'Request failed: could not load variables' }
        },
        history: null
      }
    }
    const prepared = prepareRequest(request, scope)
    if (!prepared.ok) return { result: { ok: false, error: prepared.error }, history: null }
    const startedAt = now()
    const result = await deps.supervisor.send(requestId, prepared.request)
    const endedAt = now()
    // Record the authored spec (variables unresolved), never the prepared request.
    const entry = buildEntry({
      request,
      result,
      startedAt,
      endedAt,
      collectionId,
      environmentId,
      id: randomUUID()
    })
    try {
      await deps.history.append(entry)
    } catch {
      // A failed append (a full disk, a locked or denied keychain) never fails the send.
      if (historyWarned) return { result, history: null }
      historyWarned = true
      return { result, history: null, historyWarning: HISTORY_WARNING }
    }
    return { result, history: entry }
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

  ipcMain.handle('import:open-file', (_event, raw) => {
    ipcContract['import:open-file'].input.parse(raw)
    return deps.openImportFile()
  })

  ipcMain.handle('export:save-file', (_event, raw) => {
    const { suggestedName, text } = ipcContract['export:save-file'].input.parse(raw)
    return deps.saveExportFile(suggestedName, text)
  })

  ipcMain.handle('collections:list', async (_event, raw) => {
    ipcContract['collections:list'].input.parse(raw)
    const result = await deps.collections.list()
    if (startupWarnings.length === 0) return result
    const extra = startupWarnings
    startupWarnings = []
    return { ...result, warnings: [...result.warnings, ...extra] }
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

  ipcMain.handle('history:list', (_event, raw) => {
    ipcContract['history:list'].input.parse(raw)
    return deps.history.list()
  })

  ipcMain.handle('history:delete', async (_event, raw) => {
    const { id } = ipcContract['history:delete'].input.parse(raw)
    await deps.history.delete(id)
  })

  ipcMain.handle('history:clear', async (_event, raw) => {
    ipcContract['history:clear'].input.parse(raw)
    await deps.history.clear()
  })
}
