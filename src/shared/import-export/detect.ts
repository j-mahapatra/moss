import { looksLikeCurl, parseCurl } from './curl'
import { importPostmanV21 } from './postman-v21'
import type { ImportParse } from './report'

const PASTE_MESSAGE = 'Paste a Postman v2.1 collection or a curl command'

/** Detects pasted/opened text: JSON is a v2.1 collection, `curl …` a single request. */
export function parseImport(text: string): ImportParse {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    if (!looksLikeCurl(text)) return { kind: 'error', message: PASTE_MESSAGE }
    const curl = parseCurl(text)
    return curl.ok
      ? { kind: 'request', request: curl.request, report: curl.report }
      : { kind: 'error', message: curl.error }
  }
  const result = importPostmanV21(json)
  return result.ok
    ? { kind: 'collection', collection: result.collection, report: result.report }
    : { kind: 'error', message: result.error }
}
