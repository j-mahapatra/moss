import type { ResolvedRequest, RunOptions, SendResult } from './types'

export type ToRunner =
  | { type: 'execute'; requestId: string; request: ResolvedRequest; options: RunOptions }
  | { type: 'cancel'; requestId: string }
export type FromRunner = { type: 'result'; requestId: string; result: SendResult }
