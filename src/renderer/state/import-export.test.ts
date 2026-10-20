/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers with inferred fake-api types */
import { describe, expect, it, vi } from 'vitest'
import { newCollection, toItem } from '../../shared/collection-tree'
import { parseCurl } from '../../shared/import-export/curl'
import { exportFileName, exportPostmanV21 } from '../../shared/import-export/postman-v21-export'
import { newRequestSpec, type Collection, type RequestSpec } from '../../shared/types'
import { selectDirtyIds } from './selectors'
import { noopExtras } from './test-api'
import { createWorkspaceStore } from './workspace'
import V21 from '../../shared/import-export/__fixtures__/v21-basic.json?raw'

const CURL = "curl -X POST https://api.example.com/items -H 'X-Key: 1' -d 'hello'"
const CURL_WITH_REPORT = 'curl --frobnicate https://api.example.com/x'

function setup(opts: { cols?: Collection[] } = {}) {
  const api = {
    ...noopExtras(),
    'request:send': vi.fn(async () => new Promise<never>(() => undefined)),
    'request:cancel': vi.fn(async () => undefined),
    'collections:list': vi.fn(async () => ({ collections: opts.cols ?? [], warnings: [] })),
    'import:open-file': vi.fn(
      async (): Promise<
        { ok: true; name: string; text: string } | { ok: false; error: string } | null
      > => null
    ),
    'export:save-file': vi.fn<(i: { suggestedName: string; text: string }) => Promise<boolean>>(
      async () => true
    )
  }
  const store = createWorkspaceStore(api as never)
  return { api, store }
}

const messages = (s: { notices: { tone: string; message: string }[] }) =>
  s.notices.map((n) => [n.tone, n.message])

describe('importText: collections', () => {
  it('saves the collection through the queue, sorted by name, and returns the report', async () => {
    const zed = newCollection('Zed')
    const { api, store } = setup({ cols: [zed] })
    await store.getState().init()
    const out = await store.getState().importText(V21)
    if (out.kind !== 'collection') throw new Error(`unexpected ${out.kind}`)
    expect(out.collection.name).toBe('Basic API')
    expect(Array.isArray(out.report)).toBe(true)
    expect(api['collections:save']).toHaveBeenCalledWith(out.collection)
    expect(store.getState().collections.map((c) => c.name)).toEqual(['Basic API', 'Zed'])
    expect(store.getState().notices).toEqual([])
  })

  it('a failed save returns failed, raises the queue notice and leaves no ghost', async () => {
    const { api, store } = setup()
    await store.getState().init()
    vi.mocked(api['collections:save']).mockRejectedValueOnce(new Error('disk full'))
    expect(await store.getState().importText(V21)).toEqual({ kind: 'failed' })
    expect(store.getState().collections).toEqual([])
    expect(messages(store.getState())).toEqual([
      ['danger', "Couldn't create collection: disk full"]
    ])
  })

  it('waits for init before saving, so the loaded list does not clobber it', async () => {
    const existing = newCollection('Existing')
    const { api, store } = setup({ cols: [existing] })
    const out = await store.getState().importText(V21)
    expect(out.kind).toBe('collection')
    expect(api['collections:list']).toHaveBeenCalledTimes(1)
    expect(store.getState().loaded).toBe(true)
    expect(store.getState().collections.map((c) => c.name)).toEqual(['Basic API', 'Existing'])
  })

  it('unrecognised text is an error', async () => {
    const { store } = setup()
    const out = await store.getState().importText('x')
    expect(out.kind).toBe('error')
    expect(out.kind === 'error' && out.message.length).toBeGreaterThan(0)
  })
})

describe('importText: curl requests', () => {
  it('opens the request as a fresh unsaved draft', async () => {
    const col = newCollection('Col')
    const { store } = setup({ cols: [col] })
    await store.getState().init()
    const out = await store.getState().importText(CURL)
    expect(out).toEqual({ kind: 'request', report: [], opened: 'opened' })
    const s = store.getState()
    expect(s.draft.method).toBe('POST')
    expect(s.draft.url).toBe('https://api.example.com/items')
    expect(s.active).toBeNull()
    expect(s.saved).toBeNull()
    expect(s.draftCollectionId).toBeNull()
    expect(s.notices).toEqual([])
  })

  it('a dirty unsaved draft needs confirmation; confirmDiscard opens it and raises the report', async () => {
    const { store } = setup()
    await store.getState().init()
    store.getState().updateDraft({ url: 'http://typed' })
    const out = await store.getState().importText(CURL_WITH_REPORT)
    if (out.kind !== 'request') throw new Error(`unexpected ${out.kind}`)
    expect(out.opened).toBe('confirm-discard')
    expect(out.report.length).toBeGreaterThan(0)
    expect(store.getState().draft.url).toBe('http://typed')
    expect(store.getState().ui.confirmDiscard).toMatchObject({ then: 'imported' })
    expect(store.getState().notices).toEqual([])
    store.getState().confirmDiscard()
    const s = store.getState()
    expect(s.ui.confirmDiscard).toBeNull()
    expect(s.draft.url).toBe('https://api.example.com/x')
    expect(messages(s)).toEqual([
      [
        'warning',
        `Imported request. Not carried over: ${out.report.map((n) => n.message).join('; ')}`
      ]
    ])
  })

  it('stashes an edited saved request and an unedited import is left without confirmation', async () => {
    const r: RequestSpec = { ...newRequestSpec(), name: 'Saved', url: 'http://saved' }
    const col: Collection = { ...newCollection('Col'), items: [toItem(r)] }
    const { store } = setup({ cols: [col] })
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: r.id })
    store.getState().updateDraft({ url: 'http://saved/edited' })
    expect((await store.getState().importText(CURL)).kind).toBe('request')
    expect(store.getState().stash[r.id]?.url).toBe('http://saved/edited')
    const first = store.getState().draft.id
    expect(store.getState().openImportedRequest(store.getState().draft)).toBe('opened')
    expect(store.getState().draft.id).not.toBe(first)
  })
})

describe('importFile', () => {
  it('null when the dialog is cancelled', async () => {
    const { store } = setup()
    expect(await store.getState().importFile()).toBeNull()
  })

  it('a read failure becomes an error outcome', async () => {
    const { api, store } = setup()
    api['import:open-file'].mockResolvedValueOnce({ ok: false, error: 'Not a file' })
    expect(await store.getState().importFile()).toEqual({ kind: 'error', message: 'Not a file' })
  })

  it('a rejected call becomes an error outcome', async () => {
    const { api, store } = setup()
    api['import:open-file'].mockRejectedValueOnce(new Error('ipc down'))
    expect(await store.getState().importFile()).toEqual({
      kind: 'error',
      message: "Couldn't open the file: ipc down"
    })
  })

  it('imports the file text', async () => {
    const { api, store } = setup()
    api['import:open-file'].mockResolvedValueOnce({ ok: true, name: 'c.json', text: V21 })
    const out = await store.getState().importFile()
    expect(out?.kind).toBe('collection')
    expect(store.getState().collections.map((c) => c.name)).toEqual(['Basic API'])
  })
})

describe('exportCollection', () => {
  const col: Collection = {
    ...newCollection('My API / v2'),
    items: [toItem({ ...newRequestSpec(), name: 'R', url: 'http://x' })]
  }

  it('saves 2-space v2.1 JSON under the export file name', async () => {
    const { api, store } = setup({ cols: [col] })
    await store.getState().init()
    expect(await store.getState().exportCollection(col.id)).toBe('saved')
    const input = api['export:save-file'].mock.calls[0]?.[0]
    expect(input?.suggestedName).toBe(exportFileName(col))
    expect(input?.text).toBe(JSON.stringify(exportPostmanV21(col), null, 2))
    expect(JSON.parse(input?.text ?? '')).toEqual(exportPostmanV21(col))
  })

  it('warns with only a count when secrets were left out', async () => {
    const withSecret: Collection = {
      ...col,
      variables: [{ key: 'k', value: 'HUNTER2', enabled: true, secret: true }]
    }
    const { api, store } = setup({ cols: [withSecret] })
    await store.getState().init()
    expect(await store.getState().exportCollection(col.id)).toBe('saved')
    expect(messages(store.getState())).toEqual([
      ['warning', 'Secret values were left out of the export (1).']
    ])
    expect(api['export:save-file'].mock.calls[0]?.[0].text).not.toContain('HUNTER2')
  })

  it('a cancelled dialog gives cancelled', async () => {
    const { api, store } = setup({ cols: [col] })
    await store.getState().init()
    api['export:save-file'].mockResolvedValueOnce(false)
    expect(await store.getState().exportCollection(col.id)).toBe('cancelled')
    expect(store.getState().notices).toEqual([])
  })

  it('a rejection raises a notice and gives failed', async () => {
    const { api, store } = setup({ cols: [col] })
    await store.getState().init()
    api['export:save-file'].mockRejectedValueOnce(new Error('EACCES'))
    expect(await store.getState().exportCollection(col.id)).toBe('failed')
    expect(messages(store.getState())).toEqual([
      ['danger', `Couldn't export "My API / v2": EACCES`]
    ])
  })

  it('a cancelled or failed export of a collection with secrets raises no left-out notice', async () => {
    const withSecret: Collection = {
      ...col,
      variables: [{ key: 'k', value: 'HUNTER2', enabled: true, secret: true }]
    }
    const { api, store } = setup({ cols: [withSecret] })
    await store.getState().init()
    api['export:save-file'].mockResolvedValueOnce(false)
    expect(await store.getState().exportCollection(col.id)).toBe('cancelled')
    expect(store.getState().notices).toEqual([])
    api['export:save-file'].mockRejectedValueOnce(new Error('EACCES'))
    expect(await store.getState().exportCollection(col.id)).toBe('failed')
    expect(messages(store.getState())).toEqual([
      ['danger', `Couldn't export "My API / v2": EACCES`]
    ])
  })

  it('waits for init, so a collection that is still loading can be exported', async () => {
    const col = newCollection('Late')
    const { api, store } = setup({ cols: [col] })
    expect(await store.getState().exportCollection(col.id)).toBe('saved')
    expect(store.getState().loaded).toBe(true)
    expect(api['export:save-file']).toHaveBeenCalledTimes(1)
  })

  it('an unknown id gives failed without calling the api', async () => {
    const { api, store } = setup()
    await store.getState().init()
    expect(await store.getState().exportCollection(crypto.randomUUID())).toBe('failed')
    expect(api['export:save-file']).not.toHaveBeenCalled()
    expect(store.getState().notices).toEqual([])
  })
})

describe('applyCurlToDraft', () => {
  it('replaces the request parts, keeps id and name, and marks the saved request dirty', async () => {
    const r: RequestSpec = { ...newRequestSpec(), name: 'Saved', url: 'http://saved' }
    const col: Collection = { ...newCollection('Col'), items: [toItem(r)] }
    const { store } = setup({ cols: [col] })
    await store.getState().init()
    store.getState().openRequest({ collectionId: col.id, requestId: r.id })
    expect(store.getState().applyCurlToDraft(CURL)).toBe(true)
    const parsed = parseCurl(CURL)
    if (!parsed.ok) throw new Error('fixture')
    const s = store.getState()
    expect(s.draft).toEqual({ ...parsed.request, id: r.id, name: 'Saved' })
    expect(selectDirtyIds(s).has(r.id)).toBe(true)
    expect(s.notices).toEqual([])
  })

  it('raises one warning listing what was not carried over', async () => {
    const { store } = setup()
    expect(store.getState().applyCurlToDraft(CURL_WITH_REPORT)).toBe(true)
    const parsed = parseCurl(CURL_WITH_REPORT)
    if (!parsed.ok) throw new Error('fixture')
    expect(parsed.report.length).toBeGreaterThan(0)
    expect(messages(store.getState())).toEqual([
      [
        'warning',
        `Imported from curl. Not carried over: ${parsed.report.map((n) => n.message).join('; ')}`
      ]
    ])
  })

  it('a parse error raises a danger notice and leaves the draft unchanged', async () => {
    const { store } = setup()
    store.getState().updateDraft({ url: 'http://typed' })
    const before = structuredClone(store.getState().draft)
    expect(store.getState().applyCurlToDraft('curl')).toBe(false)
    expect(store.getState().draft).toEqual(before)
    const parsed = parseCurl('curl')
    expect(parsed.ok).toBe(false)
    expect(messages(store.getState())).toEqual([['danger', !parsed.ok ? parsed.error : '']])
  })
})
