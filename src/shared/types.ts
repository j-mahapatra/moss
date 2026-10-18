export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type KeyValue = { key: string; value: string; enabled: boolean }
export type FormField =
  | { kind: 'text'; key: string; value: string; enabled: boolean }
  | { kind: 'file'; key: string; filePath: string; enabled: boolean }
export type RequestBody =
  | { mode: 'none' }
  | { mode: 'raw'; contentType: string; text: string }
  | { mode: 'urlencoded'; fields: KeyValue[] }
  | { mode: 'form-data'; fields: FormField[] }
export type RequestAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
export type RequestSpec = {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValue[]
  headers: KeyValue[]
  body: RequestBody
  auth: RequestAuth
}

export type HeaderList = [name: string, value: string][]
export type ResolvedBody =
  | { kind: 'text'; text: string }
  | {
      kind: 'form'
      fields: ({ name: string; value: string } | { name: string; filePath: string })[]
    }
export type ResolvedRequest = {
  method: HttpMethod
  url: string
  headers: HeaderList
  body: ResolvedBody | null
}

export type HttpResponse = {
  status: number
  statusText: string
  headers: HeaderList
  bodyBase64: string
  size: number
  truncated: boolean
  timings: { ttfbMs: number; totalMs: number }
}
export type ErrorKind =
  | 'invalid-url'
  | 'invalid-request'
  | 'dns'
  | 'connection-refused'
  | 'tls'
  | 'timeout'
  | 'aborted'
  | 'runner-crashed'
  | 'unknown'
export type RequestError = { kind: ErrorKind; message: string; detail?: string }
export type SendResult = { ok: true; response: HttpResponse } | { ok: false; error: RequestError }
export type RunOptions = { timeoutMs: number; maxRedirects: number; maxBodyBytes: number }
export const DEFAULT_RUN_OPTIONS: RunOptions = {
  timeoutMs: 30_000,
  maxRedirects: 10,
  maxBodyBytes: 50 * 1024 * 1024
}

export function newRequestSpec(): RequestSpec {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { mode: 'none' },
    auth: { type: 'none' }
  }
}

export type RequestItem = RequestSpec & { kind: 'request' }
export type Folder = { id: string; kind: 'folder'; name: string; items: Item[] }
export type Item = Folder | RequestItem
export type Collection = {
  id: string
  name: string
  items: Item[]
  variables: KeyValue[]
  schemaVersion: 1
}
export type Settings = { schemaVersion: 1; split: number; navigatorCollapsed: boolean }
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  split: 0.5,
  navigatorCollapsed: false
}
