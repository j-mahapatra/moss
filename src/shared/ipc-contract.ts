import { z } from 'zod'
import { channels, type Channel } from './channels'
import { RequestSpecSchema, SendResultSchema } from './schemas'

export const SendInputSchema = z.object({
  requestId: z.uuid(),
  request: RequestSpecSchema
})

export const ipcContract = {
  'request:send': { input: SendInputSchema, output: SendResultSchema },
  'request:cancel': { input: z.object({ requestId: z.uuid() }), output: z.void() },
  'dialog:pick-file': { input: z.void(), output: z.string().nullable() },
  'response:save': {
    input: z.object({ bodyBase64: z.string(), suggestedName: z.string() }),
    output: z.boolean()
  }
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
