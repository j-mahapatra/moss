import { describe, expect, it, vi } from 'vitest'
import { registerIpc } from './ipc'
import { newRequestSpec } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'
import type { HistoryEntry, SendResult, SendOutcome } from '../shared/types'

type Handler = (event: unknown, input: unknown) => unknown

function setup(): {
  invoke: (channel: string, input?: unknown) => Promise<unknown>
  supervisor: { send: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }
  pickFile: ReturnType<typeof vi.fn>
  saveFile: ReturnType<typeof vi.fn>
  openImportFile: ReturnType<typeof vi.fn>
  saveExportFile: ReturnType<typeof vi.fn>
  scope: ReturnType<typeof vi.fn>
  collections: Record<'list' | 'save' | 'delete', ReturnType<typeof vi.fn>>
  settings: Record<'get' | 'set', ReturnType<typeof vi.fn>>
  environments: Record<'list' | 'save' | 'delete', ReturnType<typeof vi.fn>>
  history: Record<'list' | 'append' | 'delete' | 'clear', ReturnType<typeof vi.fn>>
} {
  const handlers = new Map<string, Handler>()
  const ipcMain = { handle: (c: string, h: Handler): void => void handlers.set(c, h) }
  const okResult: SendResult = { ok: false, error: { kind: 'runner-crashed', message: 'stub' } }
  const supervisor = { send: vi.fn(async () => okResult), cancel: vi.fn() }
  const pickFile = vi.fn(async () => '/tmp/a.txt')
  const saveFile = vi.fn(async () => true)
  const openImportFile = vi.fn(async () => ({ ok: true as const, name: 'a.json', text: '{}' }))
  const saveExportFile = vi.fn(async () => true)
  const scope = vi.fn(async (ids: { collectionId?: string; environmentId?: string }) =>
    ids.collectionId ? new Map([['base', 'http://h']]) : new Map([['base', 'http://x.io']])
  )
  const environments = {
    list: vi.fn(async () => ({ environments: [], warnings: ['w'] })),
    save: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined)
  }
  const collections = {
    list: vi.fn(async () => ({ collections: [], warnings: ['w'] })),
    save: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined)
  }
  const settings = {
    get: vi.fn(async () => ({ settings: DEFAULT_SETTINGS, warnings: [] })),
    set: vi.fn(async () => undefined)
  }
  const history = {
    list: vi.fn(async () => ({ entries: [], warnings: ['hw'] })),
    append: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  }
  registerIpc(ipcMain as never, {
    supervisor,
    scope,
    pickFile,
    saveFile,
    openImportFile,
    saveExportFile,
    collections: collections as never,
    settings: settings as never,
    environments: environments as never,
    history: history as never,
    now: () => 1_700_000_000_000
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
    openImportFile,
    saveExportFile,
    scope,
    collections,
    settings,
    environments,
    history
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
    })) as SendOutcome
    expect(r.history).toBeNull()
    expect(r.result.ok).toBe(false)
    if (!r.result.ok) expect(r.result.error.kind).toBe('invalid-url')
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
    expect(t.scope).toHaveBeenCalledWith({ collectionId: ID, environmentId: undefined })
    const [, req] = t.supervisor.send.mock.calls[0] as unknown as [string, { url: string }]
    expect(req.url).toBe('http://h/p')
  })

  it('passes both ids to scope', async () => {
    const t = setup()
    const ENV = '4b241101-e2bb-4255-8caf-4136c566a963'
    await t.invoke('request:send', {
      requestId: ID,
      request: newRequestSpec(),
      collectionId: ID,
      environmentId: ENV
    })
    expect(t.scope).toHaveBeenCalledWith({ collectionId: ID, environmentId: ENV })
  })

  it('rejects a send with a bad environmentId', async () => {
    const t = setup()
    await expect(
      t.invoke('request:send', { requestId: ID, request: newRequestSpec(), environmentId: '../x' })
    ).rejects.toThrow()
    expect(t.scope).not.toHaveBeenCalled()
  })

  it('returns an unknown error when scope rejects', async () => {
    const t = setup()
    t.scope.mockRejectedValueOnce(new Error('EIO'))
    const r = (await t.invoke('request:send', {
      requestId: ID,
      request: newRequestSpec(),
      collectionId: ID
    })) as SendOutcome
    expect(r).toEqual({
      result: {
        ok: false,
        error: { kind: 'unknown', message: 'Request failed: could not load variables' }
      },
      history: null
    })
    expect(t.history.append).not.toHaveBeenCalled()
    expect(t.supervisor.send).not.toHaveBeenCalled()
  })

  describe('history recording', () => {
    const okRes = {
      ok: true,
      response: { status: 200, timings: { totalMs: 7 } }
    } as unknown as SendResult

    it('appends the authored request, never resolved values', async () => {
      const t = setup()
      t.supervisor.send.mockResolvedValueOnce(okRes)
      t.scope.mockResolvedValueOnce(new Map([['base', 'http://secret-host']]))
      const out = (await t.invoke('request:send', {
        requestId: ID,
        request: { ...newRequestSpec(), url: '{{base}}/x' },
        collectionId: ID
      })) as SendOutcome
      expect(t.history.append).toHaveBeenCalledOnce()
      const entry = t.history.append.mock.calls[0]?.[0] as HistoryEntry
      expect(entry.request.url).toBe('{{base}}/x')
      expect(JSON.stringify(entry)).not.toContain('secret-host')
      expect(entry.status).toBe(200)
      expect(entry.at).toBe(new Date(1_700_000_000_000).toISOString())
      expect(entry.collectionId).toBe(ID)
      expect(out).toEqual({ result: okRes, history: entry })
    })

    it('records an aborted result with errorKind aborted', async () => {
      const t = setup()
      t.supervisor.send.mockResolvedValueOnce({
        ok: false,
        error: { kind: 'aborted', message: 'Cancelled' }
      })
      const out = (await t.invoke('request:send', {
        requestId: ID,
        request: { ...newRequestSpec(), url: 'http://x.io/a' }
      })) as SendOutcome
      expect(out.history?.errorKind).toBe('aborted')
      expect(out.history?.status).toBeNull()
      expect(t.history.append).toHaveBeenCalledOnce()
    })

    it('does not record when the runner is never reached', async () => {
      const t = setup()
      const out = (await t.invoke('request:send', {
        requestId: ID,
        request: { ...newRequestSpec(), url: 'ht tp://bad' }
      })) as SendOutcome
      expect(out.history).toBeNull()
      expect(t.history.append).not.toHaveBeenCalled()
    })

    it('keeps the send result when append rejects', async () => {
      const t = setup()
      t.supervisor.send.mockResolvedValueOnce(okRes)
      t.history.append.mockRejectedValueOnce(new Error('EIO'))
      const out = (await t.invoke('request:send', {
        requestId: ID,
        request: { ...newRequestSpec(), url: 'http://x.io/a' }
      })) as SendOutcome
      expect(out.result.ok).toBe(true)
      expect(out.history).toBeNull()
    })

    it('lists, deletes and clears history', async () => {
      const t = setup()
      expect(await t.invoke('history:list')).toEqual({ entries: [], warnings: ['hw'] })
      await t.invoke('history:delete', { id: ID })
      expect(t.history.delete).toHaveBeenCalledWith(ID)
      await t.invoke('history:clear')
      expect(t.history.clear).toHaveBeenCalledOnce()
    })

    it('rejects history:delete with a traversal id', async () => {
      const t = setup()
      await expect(t.invoke('history:delete', { id: '../x' })).rejects.toThrow()
      expect(t.history.delete).not.toHaveBeenCalled()
    })
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

  it('lists, saves and deletes environments', async () => {
    const t = setup()
    expect(await t.invoke('environments:list')).toEqual({ environments: [], warnings: ['w'] })
    const env = { id: ID, name: 'Prod', variables: [], schemaVersion: 1 }
    await t.invoke('environments:save', env)
    expect(t.environments.save).toHaveBeenCalledWith(env)
    await t.invoke('environments:delete', { id: ID })
    expect(t.environments.delete).toHaveBeenCalledWith(ID)
  })

  it('rejects environment save/delete with unsafe ids', async () => {
    const t = setup()
    await expect(
      t.invoke('environments:save', { id: '../x', name: 'n', variables: [], schemaVersion: 1 })
    ).rejects.toThrow()
    await expect(t.invoke('environments:delete', { id: 'x/../y' })).rejects.toThrow()
    expect(t.environments.save).not.toHaveBeenCalled()
    expect(t.environments.delete).not.toHaveBeenCalled()
  })

  it('opens an import file through the deps', async () => {
    const t = setup()
    expect(await t.invoke('import:open-file')).toEqual({ ok: true, name: 'a.json', text: '{}' })
    expect(t.openImportFile).toHaveBeenCalledTimes(1)
    await expect(t.invoke('import:open-file', { path: '/etc/passwd' })).rejects.toThrow()
    expect(t.openImportFile).toHaveBeenCalledTimes(1)
  })

  it('saves an export file through the deps after parsing the input', async () => {
    const t = setup()
    expect(await t.invoke('export:save-file', { suggestedName: 'c.json', text: '{}' })).toBe(true)
    expect(t.saveExportFile).toHaveBeenCalledWith('c.json', '{}')
    await expect(t.invoke('export:save-file', { suggestedName: '', text: '{}' })).rejects.toThrow()
    await expect(
      t.invoke('export:save-file', { suggestedName: 'x'.repeat(256), text: '{}' })
    ).rejects.toThrow()
    await expect(t.invoke('export:save-file', { suggestedName: 'c.json' })).rejects.toThrow()
    expect(t.saveExportFile).toHaveBeenCalledTimes(1)
  })
})
