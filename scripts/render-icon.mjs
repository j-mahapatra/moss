// Renders build/icon.svg into the app's raster icons. Run with `npm run gen:icon`
// (`electron scripts/render-icon.mjs`); it needs macOS for `iconutil`.
// Writes build/icon.png (1024²), resources/icon.png (512²) and build/icon.icns.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS: Electron runs this file directly, so it can't carry type annotations */
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const svgPath = join(root, 'build/icon.svg')

// The 10 standard iconset entries: [file name, pixel size].
const ICONSET = [16, 32, 128, 256, 512].flatMap((size) => [
  [`icon_${size}x${size}.png`, size],
  [`icon_${size}x${size}@2x.png`, size * 2]
])

// Draws the SVG onto a canvas at each size inside the page and returns PNG data URLs.
async function rasterise(win, sizes) {
  const svg = readFileSync(svgPath, 'utf8')
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = ${JSON.stringify(src)}
    await img.decode()
    const out = {}
    for (const size of ${JSON.stringify(sizes)}) {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      out[size] = canvas.toDataURL('image/png')
    }
    return out
  })()`)
}

function pngBuffer(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
}

async function main() {
  const win = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('data:text/html,<!doctype html><title>icon</title>')

  const sizes = [...new Set([1024, 512, ...ICONSET.map(([, size]) => size)])]
  const pngs = await rasterise(win, sizes)
  win.destroy()

  const write = (file, size) => {
    writeFileSync(file, pngBuffer(pngs[size]))
    console.log(`Wrote ${file} (${size}x${size})`)
  }
  write(join(root, 'build/icon.png'), 1024)
  write(join(root, 'resources/icon.png'), 512)

  const scratch = mkdtempSync(join(tmpdir(), 'moss-icon-'))
  try {
    const iconset = join(scratch, 'icon.iconset')
    mkdirSync(iconset)
    for (const [name, size] of ICONSET) writeFileSync(join(iconset, name), pngBuffer(pngs[size]))
    const icns = join(root, 'build/icon.icns')
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns])
    console.log(`Wrote ${icns}`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

app.dock?.hide()
app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (err) => {
      console.error(err)
      app.exit(1)
    }
  )
