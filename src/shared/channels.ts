// Zod-free so the sandboxed preload can import it without pulling in other modules.
export const channels = [
  'request:send',
  'request:cancel',
  'dialog:pick-file',
  'response:save',
  'collections:list',
  'collections:save',
  'collections:delete',
  'settings:get',
  'settings:set',
  'environments:list',
  'environments:save',
  'environments:delete'
] as const

export type Channel = (typeof channels)[number]
