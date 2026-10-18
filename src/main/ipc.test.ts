import { describe, expect, it, vi } from 'vitest'
import { registerIpc } from './ipc'
import { newRequestSpec } from '../shared/types'
import type { SendResult } from '../shared/types'

type Handler = (event: unknown, input: unknown) => unknown

function setup(): {
  invoke: (channel: string, input?: unknown) => Promise<unknown>
  supervisor: { send: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }
  pickFile: ReturnType<typeof vi.fn>
  saveFile: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<string, Handler>()
  const ipcMain = { handle: (c: string, h: Handler): void => void handlers.set(c, h) }
  const okResult: SendResult = { ok: false, error: { kind: 'runner-crashed', message: 'stub' } }
  const supervisor = { send: vi.fn(async () => okResult), cancel: vi.fn() }
  const pickFile = vi.fn(async () => '/tmp/a.txt')
  const saveFile = vi.fn(async () => true)
  registerIpc(ipcMain as never, {
    supervisor,
    scope: () => new Map([['base', 'http://x.io']]),
    pickFile,
    saveFile
  })
  return {
    invoke: async (c, i) => {
      const h = handlers.get(c)
      if (!h) throw new Error(`no handler ${c}`)
      return h({}, i)
    },
    supervisor,
    pickFile,
    saveFile
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
})
