import { executeRequest } from './execute'
import type { FromRunner, ToRunner } from '../shared/runner-protocol'

export function createRunnerHandler(
  post: (m: FromRunner) => void,
  execute: typeof executeRequest = executeRequest
): (msg: ToRunner) => Promise<void> {
  const controllers = new Map<string, AbortController>()
  return async (msg) => {
    if (msg.type === 'cancel') {
      controllers.get(msg.requestId)?.abort()
      return
    }
    const controller = new AbortController()
    controllers.set(msg.requestId, controller)
    try {
      const result = await execute(msg.request, msg.options, controller.signal)
      post({ type: 'result', requestId: msg.requestId, result })
    } finally {
      controllers.delete(msg.requestId)
    }
  }
}
