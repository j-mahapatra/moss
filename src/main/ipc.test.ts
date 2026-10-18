import { describe, expect, it, vi } from 'vitest'
import { registerIpc } from './ipc'
import { newRequestSpec } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'
import type { SendResult } from '../shared/types'

type Handler = (event: unknown, input: unknown) => unknown

function setup(): {
  invoke: (channel: string, input?: unknown) => Promise<unknown>
  supervisor: { send: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }
  pickFile: ReturnType<typeof vi.fn>
  saveFile: ReturnType<typeof vi.fn>
  scope: ReturnType<typeof vi.fn>
  collections: Record<'list' | 'save' | 'delete', ReturnType<typeof vi.fn>>
  settings: Record<'get' | 'set', ReturnType<typeof vi.fn>>
} {
  const handlers = new Map<string, Handler>()
  const ipcMain = { handle: (c: string, h: Handler): void => void handlers.set(c, h) }
  const okResult: SendResult = { ok: false, error: { kind: 'runner-crashed', message: 'stub' } }
  const supervisor = { send: vi.fn(async () => okResult), cancel: vi.fn() }
  const pickFile = vi.fn(async () => '/tmp/a.txt')
  const saveFile = vi.fn(async () => true)
  const scope = vi.fn(async (id: string | undefined) =>
    id ? new Map([['base', 'http://h']]) : new Map([['base', 'http://x.io']])
  )
  const collections = {
    list: vi.fn(async () => ({ collections: [], warnings: ['w'] })),
    save: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined)
  }
  const settings = {
    get: vi.fn(async () => ({ settings: DEFAULT_SETTINGS, warnings: [] })),
    set: vi.fn(async () => undefined)
  }
  registerIpc(ipcMain as never, {
    supervisor,
    scope,
    pickFile,
    saveFile,
    collections: collections as never,
    settings: settings as never
  })
  return {
    invoke: async (c, i) => {
      const h = handlers.get(c)
      if (!h) throw new Error(`no handler ${c}`)
      return h({}, i)
    },
    supervisor,
    pickFile,
    saveFile,
    scope,
    collections,
    settings
  }
}
const ID = '3b241101-e2bb-4255-8caf-4136c566a962'

describe('registerIpc', () => {
  it('sends a resolved request', async () => {
    const t = setup()
    await t.invoke('request:send', {
      requestId: ID,
      request: { ...newRequestSpec(), url: '{{base}}/p' }
    })
    expect(t.supervisor.send).toHaveBeenCalledOnce()
    const [id, req] = t.supervisor.send.mock.calls[0] as unknown as [string, { url: string }]
    expect(id).toBe(ID)
    expect(req.url).toBe('http://x.io/p')
  })

  it('returns invalid-url without calling the runner', async () => {
    const t = setup()
    const r = (await t.invoke('request:send', {
      requestId: ID,
      request: { ...newRequestSpec(), url: 'ht tp://bad' }
    })) as SendResult
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('invalid-url')
    expect(t.supervisor.send).not.toHaveBeenCalled()
  })

  it('rejects malformed payloads', async () => {
    const t = setup()
    await expect(
      t.invoke('request:send', { requestId: 'nope', request: newRequestSpec() })
    ).rejects.toThrow()
    expect(t.supervisor.send).not.toHaveBeenCalled()
  })

  it('forwards cancel', async () => {
    const t = setup()
    await t.invoke('request:cancel', { requestId: ID })
    expect(t.supervisor.cancel).toHaveBeenCalledWith(ID)
  })

  it('returns the picked file', async () => {
    const t = setup()
    expect(await t.invoke('dialog:pick-file')).toBe('/tmp/a.txt')
  })

  it('saves a response body', async () => {
    const t = setup()
    expect(await t.invoke('response:save', { bodyBase64: 'aGk=', suggestedName: 'r.txt' })).toBe(
      true
    )
    expect(t.saveFile).toHaveBeenCalledWith('aGk=', 'r.txt')
  })

  it('resolves variables from the collection scope', async () => {
    const t = setup()
    await t.invoke('request:send', {
      requestId: ID,
      request: { ...newRequestSpec(), url: '{{base}}/p' },
      collectionId: ID
    })
    expect(t.scope).toHaveBeenCalledWith(ID)
    const [, req] = t.supervisor.send.mock.calls[0] as unknown as [string, { url: string }]
    expect(req.url).toBe('http://h/p')
  })

  it('uses scope(undefined) without a collectionId', async () => {
    const t = setup()
    await t.invoke('request:send', { requestId: ID, request: newRequestSpec() })
    expect(t.scope).toHaveBeenCalledWith(undefined)
  })

  it('returns an unknown error when scope rejects', async () => {
    const t = setup()
    t.scope.mockRejectedValueOnce(new Error('EIO'))
    const r = (await t.invoke('request:send', {
      requestId: ID,
      request: newRequestSpec(),
      collectionId: ID
    })) as SendResult
    expect(r).toEqual({
      ok: false,
      error: { kind: 'unknown', message: 'Request failed: could not load collection variables' }
    })
    expect(t.supervisor.send).not.toHaveBeenCalled()
  })

  it('lists collections', async () => {
    const t = setup()
    expect(await t.invoke('collections:list')).toEqual({ collections: [], warnings: ['w'] })
  })

  it('saves a collection with the parsed input', async () => {
    const t = setup()
    const c = { id: ID, name: 'C', variables: [], items: [], schemaVersion: 1 as const }
    await t.invoke('collections:save', c)
    expect(t.collections.save).toHaveBeenCalledWith(c)
  })

  it('rejects a collection with an unsafe id', async () => {
    const t = setup()
    await expect(
      t.invoke('collections:save', {
        id: '../../evil',
        name: 'C',
        variables: [],
        items: [],
        schemaVersion: 1 as const
      })
    ).rejects.toThrow()
    expect(t.collections.save).not.toHaveBeenCalled()
  })

  it('deletes a collection by id', async () => {
    const t = setup()
    await t.invoke('collections:delete', { id: ID })
    expect(t.collections.delete).toHaveBeenCalledWith(ID)
  })

  it('rejects delete with an unsafe id', async () => {
    const t = setup()
    await expect(t.invoke('collections:delete', { id: 'x/../y' })).rejects.toThrow()
    expect(t.collections.delete).not.toHaveBeenCalled()
  })

  it('gets and sets settings', async () => {
    const t = setup()
    expect(await t.invoke('settings:get')).toEqual({ settings: DEFAULT_SETTINGS, warnings: [] })
    await t.invoke('settings:set', DEFAULT_SETTINGS)
    expect(t.settings.set).toHaveBeenCalledWith(DEFAULT_SETTINGS)
  })
})
