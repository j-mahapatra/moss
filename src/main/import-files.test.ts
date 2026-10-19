import { describe, expect, it, vi } from 'vitest'
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from '../shared/import-export/report'
import { IMPORT_FILTERS, readImportFile, type ImportFs, type ImportHandle } from './import-files'

type Fake = {
  fs: ImportFs
  handle: ImportHandle & { close: ReturnType<typeof vi.fn> }
  requested: () => number
}

/** A handle over `content`; `endless` keeps producing bytes however much is asked for. */
function fake(opts: {
  size?: number
  isFile?: boolean
  content?: Buffer
  endless?: boolean
  readError?: Error
  statError?: Error
  openError?: Error
}): Fake {
  const content = opts.content ?? Buffer.alloc(0)
  let asked = 0
  const handle = {
    stat: vi.fn(async () => {
      if (opts.statError) throw opts.statError
      return { size: opts.size ?? content.byteLength, isFile: () => opts.isFile ?? true }
    }),
    read: vi.fn(async (buf: Buffer, offset: number, length: number, position: number) => {
      if (opts.readError) throw opts.readError
      asked += length
      if (opts.endless) {
        buf.fill(0x61, offset, offset + length)
        return { bytesRead: length }
      }
      const n = content.copy(buf, offset, position, position + length)
      return { bytesRead: n }
    }),
    close: vi.fn(async () => undefined)
  }
  const fs: ImportFs = {
    open: vi.fn(async () => {
      if (opts.openError) throw opts.openError
      return handle
    })
  }
  return { fs, handle, requested: () => asked }
}

describe('readImportFile', () => {
  it('reads UTF-8 text, strips a BOM and names the file by its basename', async () => {
    const content = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":"é"}')])
    const f = fake({ content })
    const r = await readImportFile('/some/dir/col.json', f.fs)
    expect(r).toEqual({ ok: true, name: 'col.json', text: '{"a":"é"}' })
    expect(f.handle.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a file over the limit without reading it', async () => {
    const f = fake({ size: IMPORT_MAX_BYTES + 1 })
    expect(await readImportFile('/x/big.json', f.fs)).toEqual({
      ok: false,
      error: IMPORT_TOO_LARGE
    })
    expect(f.handle.read).not.toHaveBeenCalled()
    expect(f.handle.close).toHaveBeenCalledTimes(1)
  })

  it('accepts a file exactly at the limit', async () => {
    const f = fake({ content: Buffer.alloc(IMPORT_MAX_BYTES, 0x78) })
    const r = await readImportFile('/x/ok.txt', f.fs)
    expect(r.ok && r.text.length).toBe(IMPORT_MAX_BYTES)
  })

  it('never reads more than the limit + 1 bytes from a file that keeps growing', async () => {
    const f = fake({ size: 10, endless: true })
    expect(await readImportFile('/x/grow.json', f.fs)).toEqual({
      ok: false,
      error: IMPORT_TOO_LARGE
    })
    expect(f.requested()).toBeLessThanOrEqual(IMPORT_MAX_BYTES + 1)
    expect(f.handle.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a directory', async () => {
    const f = fake({ isFile: false })
    expect(await readImportFile('/x/dir', f.fs)).toEqual({ ok: false, error: 'Not a file' })
    expect(f.handle.read).not.toHaveBeenCalled()
    expect(f.handle.close).toHaveBeenCalledTimes(1)
  })

  it('turns a read error into a message naming the file, and still closes', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    const f = fake({ size: 3, readError: err })
    const r = await readImportFile('/x/secret.json', f.fs)
    expect(r).toEqual({ ok: false, error: "Couldn't read secret.json: EACCES: permission denied" })
    expect(f.handle.close).toHaveBeenCalledTimes(1)
  })

  it('turns a stat error into the same read message, and still closes', async () => {
    const f = fake({ statError: new Error('EIO: bad') })
    expect(await readImportFile('/x/gone.json', f.fs)).toEqual({
      ok: false,
      error: "Couldn't read gone.json: EIO: bad"
    })
    expect(f.handle.close).toHaveBeenCalledTimes(1)
  })

  it('turns an open error into the read message', async () => {
    const f = fake({ openError: new Error('ENOENT: no such file') })
    expect(await readImportFile('/x/gone.json', f.fs)).toEqual({
      ok: false,
      error: "Couldn't read gone.json: ENOENT: no such file"
    })
  })

  it('reads a real file with the default fs', async () => {
    const r = await readImportFile(new URL('./import-files.ts', import.meta.url).pathname)
    expect(r.ok && r.name).toBe('import-files.ts')
  })
})

describe('IMPORT_FILTERS', () => {
  it('offers collections and commands, then all files', () => {
    expect(IMPORT_FILTERS).toEqual([
      { name: 'Collections and commands', extensions: ['json', 'txt', 'sh'] },
      { name: 'All Files', extensions: ['*'] }
    ])
  })
})
