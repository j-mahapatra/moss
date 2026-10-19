import { requestNameFromUrl } from '../request-name'
import { newRequestSpec } from '../types'
import type { FormField, HttpMethod, KeyValue, RequestAuth, RequestBody } from '../types'
import { applyParams, parseQuery } from '../url-params'
import { note } from './report'
import type { CurlResult, ImportReport } from './report'
import { ARG_FLAGS, LONG, NO_VALUE, SHORT } from './curl-options'
import type { Opt } from './curl-options'
import { shellWords } from './shell-words'

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const FORM_TYPE = 'application/x-www-form-urlencoded'

type State = {
  method?: HttpMethod
  get: boolean
  head: boolean
  url?: string
  headers: KeyValue[]
  auth: RequestAuth
  data: string[]
  encoded: KeyValue[]
  form: FormField[]
  report: ImportReport
}

const kv = (key: string, value: string): KeyValue => ({ key, value, enabled: true })

/** True iff the text (ignoring leading whitespace) starts with the word `curl`. */
export function looksLikeCurl(text: string): boolean {
  return /^curl(\s|$)/.test(text.trimStart())
}

/** Applies one option; returns an error message if the whole import must fail. */
function apply(s: State, opt: Opt, flag: string, value: string): string | null {
  const add = (message: string): void => void s.report.push(note('', message))
  const eq = value.indexOf('=')
  switch (opt) {
    case 'method': {
      const m = value.toUpperCase()
      if (!(METHODS as readonly string[]).includes(m)) return `Unsupported method "${m}"`
      s.method = m as HttpMethod
      break
    }
    case 'header': {
      const colon = value.indexOf(':')
      const name = colon === -1 ? '' : value.slice(0, colon).trim()
      if (!name) {
        add(`Malformed header "${value}"`)
        break
      }
      const v = value.slice(colon + 1).trimStart()
      const bearer = /^bearer\s+(.*)$/is.exec(v)
      if (name.toLowerCase() === 'authorization' && bearer) {
        s.auth = { type: 'bearer', token: bearer[1] ?? '' }
      } else {
        s.headers.push(kv(name, v))
      }
      break
    }
    case 'user-agent':
      s.headers.push(kv('User-Agent', value))
      break
    case 'referer':
      s.headers.push(kv('Referer', value))
      break
    case 'cookie':
      if (eq === -1) add(`Cookie file (${value}) was not imported`)
      else s.headers.push(kv('Cookie', value))
      break
    case 'user': {
      const colon = value.indexOf(':')
      s.auth =
        colon === -1
          ? { type: 'basic', username: value, password: '' }
          : { type: 'basic', username: value.slice(0, colon), password: value.slice(colon + 1) }
      break
    }
    case 'data':
      if (value.startsWith('@')) add(`File data (${value}) was not imported`)
      else s.data.push(value)
      break
    case 'data-raw':
      s.data.push(value)
      break
    case 'data-urlencode':
      if (eq > 0) s.encoded.push(kv(value.slice(0, eq), value.slice(eq + 1)))
      else add(`Unsupported --data-urlencode value "${value}"`)
      break
    case 'form': {
      const key = value.slice(0, Math.max(eq, 0))
      const content = value.slice(eq + 1)
      if (eq <= 0) {
        add(`Malformed form field "${value}"`)
      } else if (content.startsWith('@')) {
        s.form.push({ kind: 'file', key, filePath: '', enabled: true })
        add(`Choose the file for "${key}" again`)
      } else if (content.startsWith('<')) {
        add(`File data (${content}) was not imported`)
      } else {
        s.form.push({ kind: 'text', key, value: content, enabled: true })
      }
      break
    }
    case 'get':
      s.get = true
      break
    case 'head':
      s.head = true
      break
    case 'url':
      if (s.url === undefined) s.url = value
      else add(`Extra URL ignored: ${value}`)
      break
    case 'ignored':
      add(`Ignored option ${flag}`)
      break
  }
  return null
}

/** Walks the words after `curl`; returns an error message on a fatal option. */
function readOptions(s: State, words: string[]): string | null {
  let i = 0
  const next = (): string | undefined => words[i++]
  const run = (opt: Opt, flag: string, value: string | undefined): string | null => {
    if (NO_VALUE.has(opt)) return apply(s, opt, flag, '')
    if (value === undefined) {
      s.report.push(note('', `Option ${flag} needs a value`))
      return null
    }
    return apply(s, opt, flag, value)
  }

  while (i < words.length) {
    const word = next() as string
    if (word.startsWith('--') && word.length > 2) {
      const eq = word.indexOf('=')
      const flag = eq === -1 ? word : word.slice(0, eq)
      const inline = eq === -1 ? undefined : word.slice(eq + 1)
      const opt = LONG[flag.slice(2)]
      if (opt) {
        const error = run(opt, flag, NO_VALUE.has(opt) ? undefined : (inline ?? next()))
        if (error) return error
      } else {
        s.report.push(note('', `Unsupported option ${flag}`))
        if (ARG_FLAGS.has(flag) && inline === undefined) next()
      }
    } else if (word.startsWith('-') && word.length > 1) {
      for (let j = 1; j < word.length; j++) {
        const flag = `-${word[j]}`
        const opt = SHORT[word[j] as string]
        const takesValue = opt ? !NO_VALUE.has(opt) : ARG_FLAGS.has(flag)
        const value = takesValue ? word.slice(j + 1) || next() : undefined
        if (opt) {
          const error = run(opt, flag, value)
          if (error) return error
        } else {
          s.report.push(note('', `Unsupported option ${flag}`))
        }
        if (takesValue) break
      }
    } else {
      apply(s, 'url', '--url', word)
    }
  }
  return null
}

function decodeForm(text: string): string {
  const spaced = text.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(spaced)
  } catch {
    return text
  }
}

/** `-d` parts are already form-encoded; `--data-urlencode` content gets encoded here. */
function encodedParts(s: State, plusAsSpace: boolean): string[] {
  const data = plusAsSpace ? s.data.map((d) => d.replace(/\+/g, '%20')) : s.data
  return [...data, ...s.encoded.map((f) => `${f.key}=${encodeURIComponent(f.value)}`)]
}

function appendQuery(url: string, parts: string[]): string {
  const hash = url.indexOf('#')
  const base = hash === -1 ? url : url.slice(0, hash)
  const fragment = hash === -1 ? '' : url.slice(hash)
  const joiner = !base.includes('?') ? '?' : /[?&]$/.test(base) ? '' : '&'
  return `${base}${joiner}${parts.join('&')}${fragment}`
}

function buildBody(s: State): RequestBody {
  const hasData = s.data.length > 0 || s.encoded.length > 0
  if (s.form.length > 0) {
    if (hasData) s.report.push(note('', '--data ignored because --form was given'))
    return { mode: 'form-data', fields: s.form }
  }
  if (!hasData || s.get) return { mode: 'none' }
  const isContentType = (h: KeyValue): boolean => h.key.toLowerCase() === 'content-type'
  const contentType = s.headers.filter(isContentType).at(-1)?.value
  const isForm = (v: string): boolean => (v.split(';')[0] ?? '').trim().toLowerCase() === FORM_TYPE
  if (contentType !== undefined && !isForm(contentType)) {
    return { mode: 'raw', contentType, text: encodedParts(s, false).join('&') }
  }
  s.headers = s.headers.filter((h) => !(isContentType(h) && isForm(h.value)))
  const fields = s.data
    .flatMap((d) => d.split('&'))
    .filter((part) => part !== '')
    .map((part) => {
      const eq = part.indexOf('=')
      return eq === -1
        ? kv(decodeForm(part), '')
        : kv(decodeForm(part.slice(0, eq)), decodeForm(part.slice(eq + 1)))
    })
  return { mode: 'urlencoded', fields: [...fields, ...s.encoded] }
}

function dedupe(report: ImportReport): ImportReport {
  const seen = new Set<string>()
  return report.filter((n) => {
    const id = `${n.path}\u0000${n.message}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Parses a single `curl …` command line into a request. Never throws. */
export function parseCurl(text: string): CurlResult {
  const split = shellWords(text)
  if (!split.ok) return split
  const [first, ...rest] = split.words
  if (first !== 'curl') return { ok: false, error: 'Not a curl command' }

  const s: State = {
    get: false,
    head: false,
    headers: [],
    auth: { type: 'none' },
    data: [],
    encoded: [],
    form: [],
    report: []
  }
  const error = readOptions(s, rest)
  if (error) return { ok: false, error }
  if (s.url === undefined || s.url === '') {
    return { ok: false, error: 'No URL found in curl command' }
  }

  const hasPayload = s.form.length > 0 || s.data.length > 0 || s.encoded.length > 0
  const method: HttpMethod =
    s.method ?? (s.head ? 'HEAD' : s.get ? 'GET' : hasPayload ? 'POST' : 'GET')
  const rawUrl =
    s.get && s.form.length === 0 && (s.data.length > 0 || s.encoded.length > 0)
      ? appendQuery(s.url, encodedParts(s, true))
      : s.url
  const body = buildBody(s)
  const params = parseQuery(rawUrl)
  const url = applyParams(rawUrl, params)

  return {
    ok: true,
    request: {
      ...newRequestSpec(),
      name: requestNameFromUrl(method, url),
      method,
      url,
      params,
      headers: s.headers,
      body,
      auth: s.auth
    },
    report: dedupe(s.report)
  }
}
