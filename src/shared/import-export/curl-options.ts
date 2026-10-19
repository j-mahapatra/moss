/** cURL option table: which flags Moss understands and how each one is read. */

export type Opt =
  | 'method'
  | 'header'
  | 'user-agent'
  | 'referer'
  | 'cookie'
  | 'user'
  | 'data'
  | 'data-raw'
  | 'data-urlencode'
  | 'form'
  | 'get'
  | 'head'
  | 'url'
  | 'ignored'

export const SHORT: Record<string, Opt> = {
  X: 'method',
  H: 'header',
  A: 'user-agent',
  e: 'referer',
  b: 'cookie',
  u: 'user',
  d: 'data',
  F: 'form',
  G: 'get',
  I: 'head',
  L: 'ignored',
  s: 'ignored',
  S: 'ignored',
  k: 'ignored',
  i: 'ignored',
  v: 'ignored'
}

export const LONG: Record<string, Opt> = {
  request: 'method',
  header: 'header',
  'user-agent': 'user-agent',
  referer: 'referer',
  cookie: 'cookie',
  user: 'user',
  data: 'data',
  'data-ascii': 'data',
  'data-binary': 'data',
  'data-raw': 'data-raw',
  'data-urlencode': 'data-urlencode',
  form: 'form',
  get: 'get',
  head: 'head',
  url: 'url',
  compressed: 'ignored',
  'http1.1': 'ignored',
  http2: 'ignored',
  location: 'ignored',
  silent: 'ignored',
  'show-error': 'ignored',
  insecure: 'ignored',
  include: 'ignored',
  verbose: 'ignored'
}

export const NO_VALUE = new Set<Opt>(['get', 'head', 'ignored'])

/** Unsupported flags whose argument is consumed (and not echoed in the report). */
export const ARG_FLAGS = new Set(
  '-o --output -w --write-out -m --max-time --connect-timeout -x --proxy -c --cookie-jar --cacert --cert --key -T --upload-file -r --range --retry --resolve'.split(
    ' '
  )
)
