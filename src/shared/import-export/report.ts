import type { Collection, RequestSpec } from '../types'

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const IMPORT_TOO_LARGE = 'File is too large to import (max 10 MB)'

/** path: "" (top level) or "Folder / Request" */
export type ImportNote = { path: string; message: string }
export type ImportReport = ImportNote[]

export type CurlResult =
  { ok: true; request: RequestSpec; report: ImportReport } | { ok: false; error: string }

export type CollectionImportResult =
  { ok: true; collection: Collection; report: ImportReport } | { ok: false; error: string }

export type ImportParse =
  | { kind: 'collection'; collection: Collection; report: ImportReport }
  | { kind: 'request'; request: RequestSpec; report: ImportReport }
  | { kind: 'error'; message: string }

export const note = (path: string, message: string): ImportNote => ({ path, message })
