/// <reference types="vite/client" />

declare global {
  interface Window {
    api: import('../shared/ipc-contract').MossApi
  }
}

export {}
