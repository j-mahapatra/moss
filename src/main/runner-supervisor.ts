import { join } from 'node:path'
import { DEFAULT_RUN_OPTIONS } from '../shared/types'
import type { ResolvedRequest, RunOptions, SendResult } from '../shared/types'
import type { FromRunner, ToRunner } from '../shared/runner-protocol'

export interface RunnerChild {
  postMessage(m: ToRunner): void
  onMessage(cb: (m: FromRunner) => void): void
  onExit(cb: (code: number) => void): void
  kill(): void
}

const CRASH_MESSAGE = 'The request runner stopped unexpectedly and was restarted. Try again.'

const fail = (
  kind: 'runner-crashed' | 'invalid-request',
  message: string,
  detail?: string
): SendResult => ({
  ok: false,
  error: detail === undefined ? { kind, message } : { kind, message, detail }
})

export class RunnerSupervisor {
  private child: RunnerChild | null = null
  private disposed = false
  private readonly pending = new Map<string, (r: SendResult) => void>()

  constructor(
    private readonly fork: () => RunnerChild,
    private readonly options: RunOptions = DEFAULT_RUN_OPTIONS
  ) {}

  send(requestId: string, request: ResolvedRequest): Promise<SendResult> {
    if (this.disposed) {
      return Promise.resolve(fail('runner-crashed', 'The request runner has been shut down.'))
    }
    if (this.pending.has(requestId)) {
      return Promise.resolve(fail('invalid-request', 'Duplicate request id'))
    }
    const child = this.ensureChild()
    return new Promise<SendResult>((resolve) => {
      this.pending.set(requestId, resolve)
      try {
        child.postMessage({ type: 'execute', requestId, request, options: this.options })
      } catch (err) {
        // Drop the broken child so the next send forks a fresh one; fail everything on it.
        this.child = null
        try {
          child.kill()
        } catch {
          // already gone
        }
        const others = [...this.pending.entries()].filter(([id]) => id !== requestId)
        this.pending.clear()
        resolve(fail('runner-crashed', CRASH_MESSAGE, String(err)))
        for (const [, other] of others) other(fail('runner-crashed', CRASH_MESSAGE))
      }
    })
  }

  cancel(requestId: string): void {
    if (!this.pending.has(requestId) || !this.child) return
    this.child.postMessage({ type: 'cancel', requestId })
  }

  dispose(): void {
    this.disposed = true
    this.child?.kill()
  }

  private ensureChild(): RunnerChild {
    if (this.child) return this.child
    const child = this.fork()
    this.child = child
    child.onMessage((m) => {
      if (m.type !== 'result') return
      const resolve = this.pending.get(m.requestId)
      if (!resolve) return
      this.pending.delete(m.requestId)
      resolve(m.result)
    })
    child.onExit(() => {
      if (this.child !== child) return
      this.child = null
      const resolvers = [...this.pending.values()]
      this.pending.clear()
      for (const resolve of resolvers) resolve(fail('runner-crashed', CRASH_MESSAGE))
    })
    return child
  }
}

// electron is required lazily so unit tests that import this module never load it.
export function forkUtilityRunner(): RunnerChild {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { utilityProcess } = require('electron') as typeof import('electron')
  const proc = utilityProcess.fork(join(__dirname, 'runner.js'), [], {
    serviceName: 'Moss Request Runner'
  })
  return {
    postMessage: (m) => proc.postMessage(m),
    onMessage: (cb) => {
      proc.on('message', (m: FromRunner) => cb(m))
    },
    onExit: (cb) => {
      proc.on('exit', (code) => cb(code))
    },
    kill: () => {
      proc.kill()
    }
  }
}
