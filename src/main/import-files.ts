import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from '../shared/import-export/report'

export { IMPORT_MAX_BYTES }

export type ImportFileResult =
  { ok: true; name: string; text: string } | { ok: false; error: string }

export type ImportFs = {
  stat(path: string): Promise<{ size: number; isFile(): boolean }>
  readFile(path: string): Promise<Buffer>
}

export const IMPORT_FILTERS = [
  { name: 'Collections and commands', extensions: ['json', 'txt', 'sh'] },
  { name: 'All Files', extensions: ['*'] }
]

const nodeFs: ImportFs = { stat, readFile: (p) => readFile(p) }

/** Reads a chosen import file as UTF-8 (BOM stripped); size and type are checked before reading. */
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
    const st = await fsImpl.stat(path)
    if (!st.isFile()) return { ok: false, error: 'Not a file' }
    if (st.size > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_TOO_LARGE }
    buf = await fsImpl.readFile(path)
  } catch (err) {
    return readError(err)
  }
  // The file may have grown between stat and read.
  if (buf.byteLength > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_TOO_LARGE }
  const text = buf.toString('utf8')
  return { ok: true, name, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text }
}
