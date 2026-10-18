import { z } from 'zod'
import type {
  ErrorKind,
  FormField,
  HeaderList,
  HttpMethod,
  HttpResponse,
  KeyValue,
  RequestAuth,
  RequestBody,
  RequestError,
  RequestSpec,
  ResolvedBody,
  ResolvedRequest,
  SendResult
} from './types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

export const KeyValueSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean()
})

export const FormFieldSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), key: z.string(), value: z.string(), enabled: z.boolean() }),
  z.object({ kind: z.literal('file'), key: z.string(), filePath: z.string(), enabled: z.boolean() })
])

export const RequestBodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('raw'), contentType: z.string(), text: z.string() }),
  z.object({ mode: z.literal('urlencoded'), fields: z.array(KeyValueSchema) }),
  z.object({ mode: z.literal('form-data'), fields: z.array(FormFieldSchema) })
])

export const RequestAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string() }),
  z.object({ type: z.literal('basic'), username: z.string(), password: z.string() })
])

export const RequestSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: HttpMethodSchema,
  url: z.string(),
  params: z.array(KeyValueSchema),
  headers: z.array(KeyValueSchema),
  body: RequestBodySchema,
  auth: RequestAuthSchema
})

const HeaderListSchema = z.array(z.tuple([z.string(), z.string()]))

const ResolvedBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({
    kind: z.literal('form'),
    fields: z.array(
      z.union([
        z.object({ name: z.string(), value: z.string() }),
        z.object({ name: z.string(), filePath: z.string() })
      ])
    )
  })
])

export const ResolvedRequestSchema = z.object({
  method: HttpMethodSchema,
  url: z.string(),
  headers: HeaderListSchema,
  body: ResolvedBodySchema.nullable()
})

export const HttpResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: HeaderListSchema,
  bodyBase64: z.string(),
  size: z.number(),
  truncated: z.boolean(),
  timings: z.object({ ttfbMs: z.number(), totalMs: z.number() })
})

const ErrorKindSchema = z.enum([
  'invalid-url',
  'invalid-request',
  'dns',
  'connection-refused',
  'tls',
  'timeout',
  'aborted',
  'runner-crashed',
  'unknown'
])

export const RequestErrorSchema = z.object({
  kind: ErrorKindSchema,
  message: z.string(),
  detail: z.string().optional()
})

export const SendResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), response: HttpResponseSchema }),
  z.object({ ok: z.literal(false), error: RequestErrorSchema })
])

// Compile-time guards: each schema must stay in lockstep with its type.
export type _Checks = [
  Assert<Equal<z.infer<typeof HttpMethodSchema>, HttpMethod>>,
  Assert<Equal<z.infer<typeof KeyValueSchema>, KeyValue>>,
  Assert<Equal<z.infer<typeof FormFieldSchema>, FormField>>,
  Assert<Equal<z.infer<typeof RequestBodySchema>, RequestBody>>,
  Assert<Equal<z.infer<typeof RequestAuthSchema>, RequestAuth>>,
  Assert<Equal<z.infer<typeof RequestSpecSchema>, RequestSpec>>,
  Assert<Equal<z.infer<typeof HeaderListSchema>, HeaderList>>,
  Assert<Equal<z.infer<typeof ResolvedBodySchema>, ResolvedBody>>,
  Assert<Equal<z.infer<typeof ResolvedRequestSchema>, ResolvedRequest>>,
  Assert<Equal<z.infer<typeof HttpResponseSchema>, HttpResponse>>,
  Assert<Equal<z.infer<typeof ErrorKindSchema>, ErrorKind>>,
  Assert<Equal<z.infer<typeof RequestErrorSchema>, RequestError>>,
  Assert<Equal<z.infer<typeof SendResultSchema>, SendResult>>
]
