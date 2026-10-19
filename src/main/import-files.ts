import { open } from 'fs/promises'
import { basename } from 'path'
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from '../shared/import-export/report'

export { IMPORT_MAX_BYTES }

export type ImportFileResult =
  { ok: true; name: string; text: string } | { ok: false; error: string }

export type ImportHandle = {
  stat(): Promise<{ size: number; isFile(): boolean }>
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number
  ): Promise<{ bytesRead: number }>
  close(): Promise<void>
}

export type ImportFs = { open(path: string): Promise<ImportHandle> }

export const IMPORT_FILTERS = [
  { name: 'Collections and commands', extensions: ['json', 'txt', 'sh'] },
  { name: 'All Files', extensions: ['*'] }
]

const nodeFs: ImportFs = { open: (p) => open(p, 'r') }
const CHUNK = 64 * 1024

/** Reads at most IMPORT_MAX_BYTES + 1 bytes, so a file that grows can't be read without bound. */
async function readCapped(h: ImportHandle): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  while (total <= IMPORT_MAX_BYTES) {
    const chunk = Buffer.allocUnsafe(Math.min(CHUNK, IMPORT_MAX_BYTES + 1 - total))
    const { bytesRead } = await h.read(chunk, 0, chunk.byteLength, total)
    if (bytesRead === 0) break
    chunks.push(chunk.subarray(0, bytesRead))
    total += bytesRead
  }
  return Buffer.concat(chunks, total)
}

/** Reads a chosen import file as UTF-8 (BOM stripped); type and size are checked on the open handle. */
export async function readImportFile(
  path: string,
  fsImpl: ImportFs = nodeFs
): Promise<ImportFileResult> {
  const name = basename(path)
  const readError = (err: unknown): ImportFileResult => ({
    ok: false,
    error: `Couldn't read ${name}: ${err instanceof Error ? err.message : String(err)}`
  })
  let buf: Buffer
  try {
    const handle = await fsImpl.open(path)
    try {
      const st = await handle.stat()
      if (!st.isFile()) return { ok: false, error: 'Not a file' }
      if (st.size > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_TOO_LARGE }
      buf = await readCapped(handle)
    } finally {
      await handle.close().catch(() => undefined)
    }
  } catch (err) {
    return readError(err)
  }
  if (buf.byteLength > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_TOO_LARGE }
  const text = buf.toString('utf8')
  return { ok: true, name, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text }
}
