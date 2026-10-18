import { contextBridge } from 'electron'

// Filled from the IPC contract in a later task. Nothing else is exposed.
const api = Object.freeze({})

contextBridge.exposeInMainWorld('api', api)
