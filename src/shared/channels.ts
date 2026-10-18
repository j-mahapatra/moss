// Zod-free so the sandboxed preload can import it without pulling in other modules.
export const channels = [
  'request:send',
  'request:cancel',
  'dialog:pick-file',
  'response:save'
] as const

export type Channel = (typeof channels)[number]
