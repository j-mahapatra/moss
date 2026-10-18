import { describe, expect, it, vi } from 'vitest'
import { createRunnerHandler } from './handler'
import type { FromRunner } from '../shared/runner-protocol'
import type { ResolvedRequest, SendResult } from '../shared/types'
import { DEFAULT_RUN_OPTIONS } from '../shared/types'

const req: ResolvedRequest = { method: 'GET', url: 'http://x.test/', headers: [], body: null }
const res: SendResult = { ok: false, error: { kind: 'aborted', message: 'x' } }

describe('createRunnerHandler', () => {
  it('executes and posts the result', async () => {
    const post = vi.fn<(m: FromRunner) => void>()
    const execute = vi.fn(async () => res)
    const handle = createRunnerHandler(post, execute)
    await handle({ type: 'execute', requestId: 'a', request: req, options: DEFAULT_RUN_OPTIONS })
    expect(post).toHaveBeenCalledWith({ type: 'result', requestId: 'a', result: res })
  })

  it('cancel aborts the signal passed to execute', async () => {
    const post = vi.fn<(m: FromRunner) => void>()
    let signal!: AbortSignal
    let release!: () => void
    const execute = vi.fn(async (_r: ResolvedRequest, _o: unknown, s: AbortSignal) => {
      signal = s
      await new Promise<void>((r) => (release = r))
      return res
    })
    const handle = createRunnerHandler(post, execute)
    const p = handle({
      type: 'execute',
      requestId: 'a',
      request: req,
      options: DEFAULT_RUN_OPTIONS
    })
    expect(signal.aborted).toBe(false)
    await handle({ type: 'cancel', requestId: 'a' })
    expect(signal.aborted).toBe(true)
    release()
    await p
  })

  it('cancel of an unknown id does nothing', async () => {
    const post = vi.fn()
    const handle = createRunnerHandler(post, vi.fn())
    await handle({ type: 'cancel', requestId: 'nope' })
    expect(post).not.toHaveBeenCalled()
  })
})
