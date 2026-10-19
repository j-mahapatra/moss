import { describe, expect, it, vi } from 'vitest'
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from '../shared/import-export/report'
import { IMPORT_FILTERS, readImportFile, type ImportFs } from './import-files'

const fakeFs = (opts: {
  size?: number
  isFile?: boolean
  content?: Buffer
  readError?: Error
}): ImportFs & { readFile: ReturnType<typeof vi.fn> } => ({
  stat: vi.fn(async () => ({
    size: opts.size ?? opts.content?.byteLength ?? 0,
    isFile: () => opts.isFile ?? true
  })),
  readFile: vi.fn(async () => {
    if (opts.readError) throw opts.readError
    return opts.content ?? Buffer.alloc(0)
  })
})

describe('readImportFile', () => {
  it('reads UTF-8 text, strips a BOM and names the file by its basename', async () => {
    const content = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":"é"}')])
    const r = await readImportFile('/some/dir/col.json', fakeFs({ content }))
    expect(r).toEqual({ ok: true, name: 'col.json', text: '{"a":"é"}' })
  })

  it('rejects a file over the limit without reading it', async () => {
    const fs = fakeFs({ size: IMPORT_MAX_BYTES + 1 })
    expect(await readImportFile('/x/big.json', fs)).toEqual({ ok: false, error: IMPORT_TOO_LARGE })
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('accepts a file exactly at the limit', async () => {
    const fs = fakeFs({ size: IMPORT_MAX_BYTES, content: Buffer.from('x') })
    expect(await readImportFile('/x/ok.txt', fs)).toEqual({ ok: true, name: 'ok.txt', text: 'x' })
  })

  it('rejects a directory', async () => {
    const fs = fakeFs({ isFile: false })
    expect(await readImportFile('/x/dir', fs)).toEqual({ ok: false, error: 'Not a file' })
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('turns a read error into a message naming the file', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    const r = await readImportFile('/x/secret.json', fakeFs({ size: 3, readError: err }))
    expect(r).toEqual({ ok: false, error: "Couldn't read secret.json: EACCES: permission denied" })
  })

  it('turns a stat error into the same read message', async () => {
    const fs: ImportFs = {
      stat: async () => {
        throw new Error('ENOENT: no such file')
      },
      readFile: async () => Buffer.alloc(0)
    }
    expect(await readImportFile('/x/gone.json', fs)).toEqual({
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
