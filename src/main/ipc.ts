import type { IpcMain } from 'electron'
import { ipcContract } from '../shared/ipc-contract'
import { prepareRequest } from '../shared/prepare'
import type { VariableScope } from '../shared/variables'
import type { RunnerSupervisor } from './runner-supervisor'

export interface IpcDeps {
  supervisor: Pick<RunnerSupervisor, 'send' | 'cancel'>
  scope: () => VariableScope
  pickFile: () => Promise<string | null>
  saveFile: (base64: string, name: string) => Promise<boolean>
}

// Invalid input throws a ZodError (a programming error); Electron rejects the renderer promise.
export function registerIpc(ipcMain: Pick<IpcMain, 'handle'>, deps: IpcDeps): void {
  ipcMain.handle('request:send', async (_event, raw) => {
    const { requestId, request } = ipcContract['request:send'].input.parse(raw)
    const prepared = prepareRequest(request, deps.scope())
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
}
