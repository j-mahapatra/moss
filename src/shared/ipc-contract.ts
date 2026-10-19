import { z } from 'zod'
import { channels, type Channel } from './channels'
import {
  CollectionSchema,
  EnvironmentSchema,
  HistoryEntrySchema,
  RequestSpecSchema,
  SendOutcomeSchema,
  SettingsSchema
} from './schemas'

export const SendInputSchema = z.object({
  requestId: z.uuid(),
  request: RequestSpecSchema,
  collectionId: z.uuid().optional(),
  environmentId: z.uuid().optional()
})

export const ipcContract = {
  'request:send': { input: SendInputSchema, output: SendOutcomeSchema },
  'request:cancel': { input: z.object({ requestId: z.uuid() }), output: z.void() },
  'dialog:pick-file': { input: z.void(), output: z.string().nullable() },
  'response:save': {
    input: z.object({ bodyBase64: z.string(), suggestedName: z.string() }),
    output: z.boolean()
  },
  'collections:list': {
    input: z.void(),
    output: z.object({ collections: z.array(CollectionSchema), warnings: z.array(z.string()) })
  },
  'collections:save': { input: CollectionSchema, output: z.void() },
  'collections:delete': { input: z.object({ id: z.uuid() }), output: z.void() },
  'settings:get': {
    input: z.void(),
    output: z.object({ settings: SettingsSchema, warnings: z.array(z.string()) })
  },
  'settings:set': { input: SettingsSchema, output: z.void() },
  'environments:list': {
    input: z.void(),
    output: z.object({ environments: z.array(EnvironmentSchema), warnings: z.array(z.string()) })
  },
  'environments:save': { input: EnvironmentSchema, output: z.void() },
  'environments:delete': { input: z.object({ id: z.uuid() }), output: z.void() },
  'history:list': {
    input: z.void(),
    output: z.object({ entries: z.array(HistoryEntrySchema), warnings: z.array(z.string()) })
  },
  'history:delete': { input: z.object({ id: z.uuid() }), output: z.void() },
  'history:clear': { input: z.void(), output: z.void() }
} as const

export { channels, type Channel }

// Compile-time check: the contract keys and the channel list must match.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export type _ChannelsMatchContract =
  Equal<keyof typeof ipcContract, Channel> extends true ? true : never
const _check: _ChannelsMatchContract = true
void _check

export type MossApi = {
  [C in Channel]: (
    input: z.input<(typeof ipcContract)[C]['input']>
  ) => Promise<z.output<(typeof ipcContract)[C]['output']>>
}
