import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/channels'
import type { MossApi } from '../shared/ipc-contract'

// Only these invoke wrappers are exposed; ipcRenderer itself never reaches the renderer.
const api = Object.freeze(
  Object.fromEntries(channels.map((c) => [c, (input?: unknown) => ipcRenderer.invoke(c, input)]))
) as MossApi

contextBridge.exposeInMainWorld('api', api)
