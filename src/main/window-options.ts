import { join } from 'path'
import type { BrowserWindowConstructorOptions } from 'electron'

export function createWindowOptions(): BrowserWindowConstructorOptions {
  return {
    title: 'Moss',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }
}
