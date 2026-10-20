import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue
} from 'electron'
import { writeFile } from 'fs/promises'
import { isAbsolute, join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createWindowOptions } from './window-options'
import { focusedDialog } from './dialog-parent'
import { isAllowedNavigation } from './navigation'
import { registerIpc } from './ipc'
import { IMPORT_FILTERS, readImportFile, type ImportFileResult } from './import-files'
import { RunnerSupervisor, forkUtilityRunner } from './runner-supervisor'
import { WriteQueue } from './storage/atomic-write'
import { CollectionsRepo } from './storage/collections-repo'
import { EnvironmentsRepo } from './storage/environments-repo'
import { HistoryRepo } from './storage/history-repo'
import { installQuitDrain, isQuitting } from './quit-drain'
import { SettingsRepo } from './storage/settings-repo'
import { createScopeResolver } from './scope'
import { chooseCipher } from './secrets/safe-storage'
import { createSecretCodec, storageNotices } from './secrets/secret-codec'

// MOSS_USER_DATA isolates e2e runs from the real user-data folder (absolute paths only).
if (!app.isPackaged && process.env.MOSS_USER_DATA && isAbsolute(process.env.MOSS_USER_DATA)) {
  app.setPath('userData', process.env.MOSS_USER_DATA)
}

const supervisor = new RunnerSupervisor(forkUtilityRunner)

// Dialogs attach to the focused window when there is one. The dialog functions are looked up at
// each call (e2e replaces them on the `dialog` object).
const focused = (): BrowserWindow | null => BrowserWindow.getFocusedWindow()
const showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue> =
  focusedDialog(focused, () => dialog.showOpenDialog.bind(dialog))
const showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue> =
  focusedDialog(focused, () => dialog.showSaveDialog.bind(dialog))

async function pickFile(): Promise<string | null> {
  const r = await showOpenDialog({ properties: ['openFile'] })
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
}

async function saveFile(base64: string, name: string): Promise<boolean> {
  const r = await showSaveDialog({ defaultPath: name })
  if (r.canceled || !r.filePath) return false
  await writeFile(r.filePath, Buffer.from(base64, 'base64'))
  return true
}

async function openImportFile(): Promise<ImportFileResult | null> {
  const r = await showOpenDialog({ properties: ['openFile'], filters: IMPORT_FILTERS })
  return r.canceled || !r.filePaths[0] ? null : readImportFile(r.filePaths[0])
}

async function saveExportFile(name: string, text: string): Promise<boolean> {
  const r = await showSaveDialog({ defaultPath: name })
  if (r.canceled || !r.filePath) return false
  await writeFile(r.filePath, text, 'utf8')
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
  electronApp.setAppUserModelId('dev.moss.desktop')

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
  // Secrets are sealed and opened inside the repos; the renderer only ever sees plaintext.
  const codec = createSecretCodec(chooseCipher({ isPackaged: app.isPackaged, env: process.env }))
  const collections = new CollectionsRepo(dataDir, queue, undefined, undefined, codec)
  const settings = new SettingsRepo(dataDir, queue)
  const environments = new EnvironmentsRepo(dataDir, queue, undefined, undefined, codec)
  const history = new HistoryRepo(dataDir, queue, undefined, undefined, codec)
  installQuitDrain(app, queue, { onDrained: () => supervisor.dispose() })
  const scope = createScopeResolver(collections, environments)

  registerIpc(ipcMain, {
    supervisor,
    scope,
    pickFile,
    saveFile,
    openImportFile,
    saveExportFile,
    collections,
    settings,
    environments,
    history,
    startupWarnings: storageNotices(codec)
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
// explicitly with Cmd + Q. A quit already under way (e.g. from SIGTERM, held by the write
// drain) closes the windows without Electron's quitting state, so finish it here.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isQuitting()) app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
