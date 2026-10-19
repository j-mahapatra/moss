import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { writeFile } from 'fs/promises'
import { isAbsolute, join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createWindowOptions } from './window-options'
import { isAllowedNavigation } from './navigation'
import { registerIpc } from './ipc'
import { RunnerSupervisor, forkUtilityRunner } from './runner-supervisor'
import { WriteQueue } from './storage/atomic-write'
import { CollectionsRepo } from './storage/collections-repo'
import { EnvironmentsRepo } from './storage/environments-repo'
import { HistoryRepo } from './storage/history-repo'
import { installQuitDrain } from './quit-drain'
import { SettingsRepo } from './storage/settings-repo'
import { createScopeResolver } from './scope'

// MOSS_USER_DATA isolates e2e runs from the real user-data folder (absolute paths only).
if (!app.isPackaged && process.env.MOSS_USER_DATA && isAbsolute(process.env.MOSS_USER_DATA)) {
  app.setPath('userData', process.env.MOSS_USER_DATA)
}

const supervisor = new RunnerSupervisor(forkUtilityRunner)

async function pickFile(): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow()
  const opts = { properties: ['openFile' as const] }
  const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
}

async function saveFile(base64: string, name: string): Promise<boolean> {
  const parent = BrowserWindow.getFocusedWindow()
  const opts = { defaultPath: name }
  const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return false
  await writeFile(r.filePath, Buffer.from(base64, 'base64'))
  return true
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    ...createWindowOptions(),
    ...(process.platform === 'linux' ? { icon } : {})
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const appFileUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, { devUrl, appFileUrl })) event.preventDefault()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('dev.moss.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // The app needs no device or web permissions; deny every request and check.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const dataDir = app.getPath('userData')
  const queue = new WriteQueue()
  const collections = new CollectionsRepo(dataDir, queue)
  const settings = new SettingsRepo(dataDir, queue)
  const environments = new EnvironmentsRepo(dataDir, queue)
  const history = new HistoryRepo(dataDir, queue)
  installQuitDrain(app, queue, { onDrained: () => supervisor.dispose() })
  const scope = createScopeResolver(collections, environments)

  registerIpc(ipcMain, {
    supervisor,
    scope,
    pickFile,
    saveFile,
    collections,
    settings,
    environments,
    history
  })
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
