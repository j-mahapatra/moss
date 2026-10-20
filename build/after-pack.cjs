/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type -- plain CommonJS: electron-builder require()s this hook directly, so it can't use imports or type annotations */
// electron-builder afterPack hook (wired in electron-builder.yml). It runs after the
// app bundle is assembled and before it is signed.
//
// Electron's stock Info.plist declares usage strings for camera, microphone, audio
// capture and Bluetooth. Moss uses none of those APIs, so the strings are removed:
// macOS then never offers a permission prompt for them.
const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const UNUSED_PERMISSION_KEYS = [
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription'
]

// Removes `key` from `plist`. A key that isn't there is fine; any other plutil
// failure is a real error and fails the build.
function removeKey(plist, key) {
  try {
    execFileSync('plutil', ['-remove', key, plist], { stdio: 'pipe' })
  } catch (err) {
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`
    if (!output.includes('No value to remove')) throw err
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const plist = join(context.appOutDir, appName, 'Contents', 'Info.plist')
  if (!existsSync(plist)) throw new Error(`afterPack: no Info.plist at ${plist}`)
  for (const key of UNUSED_PERMISSION_KEYS) removeKey(plist, key)
}
