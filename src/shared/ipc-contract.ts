import { z } from 'zod'
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

export type Channel = keyof typeof ipcContract
export type MossApi = {
  [C in Channel]: (
    input: z.input<(typeof ipcContract)[C]['input']>
  ) => Promise<z.output<(typeof ipcContract)[C]['output']>>
}

export const channels = Object.keys(ipcContract) as Channel[]
