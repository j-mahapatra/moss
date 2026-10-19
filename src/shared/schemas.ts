import { z } from 'zod'
import type {
  Collection,
  Environment,
  ErrorKind,
  Folder,
  HistoryEntry,
  FormField,
  HeaderList,
  HttpMethod,
  HttpResponse,
  Item,
  KeyValue,
  RequestAuth,
  RequestBody,
  RequestError,
  RequestSpec,
  Settings,
  ResolvedBody,
  ResolvedRequest,
  SendOutcome,
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
  id: z.uuid(),
  name: z.string(),
  method: HttpMethodSchema,
  url: z.string(),
  params: z.array(KeyValueSchema),
  headers: z.array(KeyValueSchema),
  body: RequestBodySchema,
  auth: RequestAuthSchema
})

const RequestItemSchema = RequestSpecSchema.extend({ kind: z.literal('request') })

// Recursive via zod 4 getters; the cycle is typed explicitly so inference stays finite.
export const FolderSchema: z.ZodType<Folder> = z.object({
  id: z.uuid(),
  kind: z.literal('folder'),
  name: z.string(),
  get items() {
    return z.array(ItemSchema)
  }
})

export const ItemSchema: z.ZodType<Item> = z.union([FolderSchema, RequestItemSchema])

export const CollectionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  items: z.array(ItemSchema),
  variables: z.array(KeyValueSchema),
  schemaVersion: z.literal(1)
})

export const EnvironmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  variables: z.array(KeyValueSchema),
  schemaVersion: z.literal(1)
})

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  split: z.number().min(0.2).max(0.8),
  navigatorCollapsed: z.boolean(),
  activeEnvironmentId: z.uuid().nullable().default(null)
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

const HistoryEntryBaseSchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  request: RequestSpecSchema,
  status: z.number().nullable(),
  durationMs: z.number().int().nonnegative(),
  errorKind: ErrorKindSchema.optional(),
  collectionId: z.uuid().optional(),
  environmentId: z.uuid().optional()
})

export const HistoryEntrySchema = HistoryEntryBaseSchema.superRefine((e, ctx) => {
  if (e.status === null && e.errorKind === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['errorKind'],
      message: 'errorKind is required when status is null'
    })
  } else if (e.status !== null && e.errorKind !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['errorKind'],
      message: 'errorKind must be absent when status is set'
    })
  }
})

export const SendOutcomeSchema = z.object({
  result: SendResultSchema,
  history: HistoryEntrySchema.nullable()
})

// Compile-time guards: each schema must stay in lockstep with its type.
export type _Checks = [
  Assert<Equal<z.infer<typeof HttpMethodSchema>, HttpMethod>>,
  Assert<Equal<z.infer<typeof KeyValueSchema>, KeyValue>>,
  Assert<Equal<z.infer<typeof FormFieldSchema>, FormField>>,
  Assert<Equal<z.infer<typeof RequestBodySchema>, RequestBody>>,
  Assert<Equal<z.infer<typeof RequestAuthSchema>, RequestAuth>>,
  Assert<Equal<z.infer<typeof RequestSpecSchema>, RequestSpec>>,
  Assert<Equal<z.infer<typeof CollectionSchema>, Collection>>,
  Assert<Equal<z.infer<typeof EnvironmentSchema>, Environment>>,
  Assert<Equal<z.output<typeof SettingsSchema>, Settings>>,
  Assert<Equal<z.infer<typeof HeaderListSchema>, HeaderList>>,
  Assert<Equal<z.infer<typeof ResolvedBodySchema>, ResolvedBody>>,
  Assert<Equal<z.infer<typeof ResolvedRequestSchema>, ResolvedRequest>>,
  Assert<Equal<z.infer<typeof HttpResponseSchema>, HttpResponse>>,
  Assert<Equal<z.infer<typeof ErrorKindSchema>, ErrorKind>>,
  Assert<Equal<z.infer<typeof RequestErrorSchema>, RequestError>>,
  Assert<Equal<z.infer<typeof SendResultSchema>, SendResult>>,
  Assert<Equal<z.infer<typeof HistoryEntryBaseSchema>, HistoryEntry>>,
  Assert<Equal<z.infer<typeof HistoryEntrySchema>, HistoryEntry>>,
  Assert<Equal<z.infer<typeof SendOutcomeSchema>, SendOutcome>>
]
