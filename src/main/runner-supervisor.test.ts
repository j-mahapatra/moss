import { describe, expect, it, vi } from 'vitest'
import { RunnerSupervisor, type RunnerChild } from './runner-supervisor'
import { DEFAULT_RUN_OPTIONS } from '../shared/types'
import type { ResolvedRequest, SendResult } from '../shared/types'
import type { FromRunner, ToRunner } from '../shared/runner-protocol'

class FakeChild implements RunnerChild {
  posted: ToRunner[] = []
  killed = false
  private msg: ((m: FromRunner) => void)[] = []
  private exit: ((code: number) => void)[] = []
  postMessage(m: ToRunner): void {
    this.posted.push(m)
  }
  onMessage(cb: (m: FromRunner) => void): void {
    this.msg.push(cb)
  }
  onExit(cb: (code: number) => void): void {
    this.exit.push(cb)
  }
  kill(): void {
    this.killed = true
  }
  emit(m: FromRunner): void {
    this.msg.forEach((cb) => cb(m))
  }
  die(code = 1): void {
    this.exit.forEach((cb) => cb(code))
  }
}

const req: ResolvedRequest = { method: 'GET', url: 'http://x.test/', headers: [], body: null }
const okResult: SendResult = {
  ok: true,
  response: {
    status: 200,
    statusText: 'OK',
    headers: [],
    bodyBase64: '',
    size: 0,
    truncated: false,
    timings: { ttfbMs: 1, totalMs: 2 }
  }
}

function setup(): { sup: RunnerSupervisor; children: FakeChild[]; fork: ReturnType<typeof vi.fn> } {
  const children: FakeChild[] = []
  const fork = vi.fn(() => {
    const c = new FakeChild()
    children.push(c)
    return c
  })
  return { sup: new RunnerSupervisor(fork), children, fork }
}

describe('RunnerSupervisor', () => {
  it('does not fork until the first send', () => {
    const { fork } = setup()
    expect(fork).not.toHaveBeenCalled()
  })

  it('posts execute with default options and resolves on the matching result', async () => {
    const { sup, children } = setup()
    const p = sup.send('a', req)
    expect(children[0]!.posted).toEqual([
      { type: 'execute', requestId: 'a', request: req, options: DEFAULT_RUN_OPTIONS }
    ])
    children[0]!.emit({ type: 'result', requestId: 'a', result: okResult })
    await expect(p).resolves.toEqual(okResult)
  })

  it('ignores results for other or unknown ids', async () => {
    const { sup, children } = setup()
    const p = sup.send('a', req)
    let settled = false
    void p.then(() => (settled = true))
    children[0]!.emit({ type: 'result', requestId: 'zzz', result: okResult })
    await Promise.resolve()
    expect(settled).toBe(false)
    children[0]!.emit({ type: 'result', requestId: 'a', result: okResult })
    await p
  })

  it('cancel posts a cancel message', () => {
    const { sup, children } = setup()
    void sup.send('a', req)
    sup.cancel('a')
    expect(children[0]!.posted[1]).toEqual({ type: 'cancel', requestId: 'a' })
  })

  it('cancel of an unknown id is a no-op and does not fork', () => {
    const { sup, fork } = setup()
    sup.cancel('nope')
    expect(fork).not.toHaveBeenCalled()
  })

  it('resolves all pending to runner-crashed on exit and forks fresh next time', async () => {
    const { sup, children, fork } = setup()
    const p1 = sup.send('a', req)
    const p2 = sup.send('b', req)
    children[0]!.die()
    for (const r of await Promise.all([p1, p2])) {
      expect(r).toEqual({
        ok: false,
        error: {
          kind: 'runner-crashed',
          message: 'The request runner stopped unexpectedly and was restarted. Try again.'
        }
      })
    }
    void sup.send('c', req)
    expect(fork).toHaveBeenCalledTimes(2)
  })

  it('an old child exit does not affect a newer child', async () => {
    const { sup, children } = setup()
    const p1 = sup.send('a', req)
    children[0]!.die()
    await p1
    const p2 = sup.send('b', req)
    children[0]!.die()
    children[1]!.emit({ type: 'result', requestId: 'b', result: okResult })
    await expect(p2).resolves.toEqual(okResult)
  })

  it('rejects a duplicate in-flight id as invalid-request', async () => {
    const { sup } = setup()
    void sup.send('a', req)
    await expect(sup.send('a', req)).resolves.toEqual({
      ok: false,
      error: { kind: 'invalid-request', message: 'Duplicate request id' }
    })
  })

  it('dispose kills the child, crashes pending, and later sends do not fork', async () => {
    const { sup, children, fork } = setup()
    const p = sup.send('a', req)
    sup.dispose()
    expect(children[0]!.killed).toBe(true)
    children[0]!.die()
    const r = await p
    expect(r.ok).toBe(false)
    const after = await sup.send('b', req)
    expect(after).toEqual({
      ok: false,
      error: { kind: 'runner-crashed', message: 'The request runner has been shut down.' }
    })
    expect(fork).toHaveBeenCalledTimes(1)
  })

  it('resolves runner-crashed (not reject) when postMessage throws, and recovers', async () => {
    const { sup, children, fork } = setup()
    void sup.send('warm', req)
    const first = children[0]!
    first.postMessage = (): void => {
      throw new Error('clone failed')
    }
    const r = await sup.send('a', req)
    expect(r).toEqual({
      ok: false,
      error: {
        kind: 'runner-crashed',
        message: 'The request runner stopped unexpectedly and was restarted. Try again.',
        detail: 'Error: clone failed'
      }
    })
    expect(first.killed).toBe(true)
    const retry = sup.send('a', req)
    expect(fork).toHaveBeenCalledTimes(2)
    children[1]!.emit({ type: 'result', requestId: 'a', result: okResult })
    await expect(retry).resolves.toEqual(okResult)
  })
})
