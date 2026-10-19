import { parseCurl } from '../../../shared/import-export/curl'
import { parseImport } from '../../../shared/import-export/detect'
import { exportFileName, exportPostmanV21 } from '../../../shared/import-export/postman-v21-export'
import type { ImportReport } from '../../../shared/import-export/report'
import type { Collection } from '../../../shared/types'
import type { WorkspaceApi, WorkspaceState } from '../workspace'
import { afterInit, errorMessage, type SliceCtx } from './ctx'
import type { AddNotice } from './notices'

export type ImportOutcome =
  | { kind: 'collection'; collection: Collection; report: ImportReport }
  | { kind: 'request'; report: ImportReport; opened: 'opened' | 'confirm-discard' }
  | { kind: 'error'; message: string }
  /** The collection save failed; the queue raised the notice. */
  | { kind: 'failed' }

const notCarried = (prefix: string, report: ImportReport): string | null =>
  report.length > 0
    ? `${prefix} Not carried over: ${report.map((n) => n.message).join('; ')}`
    : null

export function createImportExport(
  { set, get, api }: SliceCtx,
  addNotice: AddNotice,
  /** Saves a new collection through the collections doc queue. */
  createCollectionDoc: (c: Collection) => Promise<boolean>
): Pick<WorkspaceState, 'importText' | 'importFile' | 'exportCollection' | 'applyCurlToDraft'> {
  const importText = afterInit(get, async (text: string): Promise<ImportOutcome> => {
    const parsed = parseImport(text)
    if (parsed.kind === 'error') return parsed
    if (parsed.kind === 'collection') {
      const { collection, report } = parsed
      return (await createCollectionDoc(collection))
        ? { kind: 'collection', collection, report }
        : { kind: 'failed' }
    }
    const notice = notCarried('Imported request.', parsed.report)
    const opened = get().openImportedRequest(parsed.request, notice ? { notice } : {})
    return { kind: 'request', report: parsed.report, opened }
  })

  return {
    importText,

    importFile: async () => {
      let file: Awaited<ReturnType<WorkspaceApi['import:open-file']>>
      try {
        file = await api['import:open-file']()
      } catch (err) {
        return { kind: 'error', message: `Couldn't open the file: ${errorMessage(err)}` }
      }
      if (file === null) return null
      if (!file.ok) return { kind: 'error', message: file.error }
      return importText(file.text)
    },

    exportCollection: async (id) => {
      const c = get().collections.find((x) => x.id === id)
      if (!c) return 'failed'
      try {
        const saved = await api['export:save-file']({
          suggestedName: exportFileName(c),
          text: JSON.stringify(exportPostmanV21(c), null, 2)
        })
        return saved ? 'saved' : 'cancelled'
      } catch (err) {
        addNotice('danger', `Couldn't export "${c.name}": ${errorMessage(err)}`)
        return 'failed'
      }
    },

    applyCurlToDraft: (text) => {
      const parsed = parseCurl(text)
      if (!parsed.ok) {
        addNotice('danger', parsed.error)
        return false
      }
      const { method, url, params, headers, body, auth } = parsed.request
      set((s) => ({ draft: { ...s.draft, method, url, params, headers, body, auth } }))
      const notice = notCarried('Imported from curl.', parsed.report)
      if (notice) addNotice('warning', notice)
      return true
    }
  }
}
