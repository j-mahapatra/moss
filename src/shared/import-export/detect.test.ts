import { describe, expect, it } from 'vitest'
import { parseImport } from './detect'

const PASTE = 'Paste a Postman v2.1 collection or a curl command'
const V21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

describe('parseImport', () => {
  it('routes v2.1 JSON to the collection importer', () => {
    const r = parseImport(JSON.stringify({ info: { name: 'C', schema: V21 }, item: [] }))
    expect(r).toMatchObject({
      kind: 'collection',
      collection: { name: 'C', items: [] },
      report: []
    })
  })

  it('returns the importer error for JSON that is not a v2.1 collection', () => {
    expect(parseImport('{"a":1}')).toEqual({
      kind: 'error',
      message: 'Not a Postman v2.1 collection'
    })
  })

  it.each(['curl https://x', '  curl https://x', '\ncurl -X POST https://x -d a=1'])(
    'routes %j to the curl parser',
    (text) => {
      const r = parseImport(text)
      expect(r.kind).toBe('request')
      if (r.kind === 'request') expect(r.request.url).toBe('https://x')
    }
  )

  it('passes a curl parse error through', () => {
    expect(parseImport('curl -X COPY https://x')).toEqual({
      kind: 'error',
      message: 'Unsupported method "COPY"'
    })
  })

  it.each(['', 'garbage', '{"unterminated": ', 'curly https://x', 'wget https://x'])(
    'gives the paste message for %j',
    (text) => {
      expect(parseImport(text)).toEqual({ kind: 'error', message: PASTE })
    }
  )
})
