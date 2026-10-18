import type { KeyValue } from './types'
import { findVariables } from './variables'

// Operates on the raw string on purpose: `new URL` would mangle `{{vars}}` and scheme-less URLs.

function splitUrl(url: string): { base: string; query: string | null; fragment: string } {
  const hash = url.indexOf('#')
  const fragment = hash === -1 ? '' : url.slice(hash)
  const rest = hash === -1 ? url : url.slice(0, hash)
  const q = rest.indexOf('?')
  if (q === -1) return { base: rest, query: null, fragment }
  return { base: rest.slice(0, q), query: rest.slice(q + 1), fragment }
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** Enabled rows from the query string, decoded (raw text if the escapes are malformed). */
export function parseQuery(url: string): KeyValue[] {
  const { query } = splitUrl(url)
  if (!query) return []
  return query
    .split('&')
    .filter((part) => part !== '')
    .map((part) => {
      const eq = part.indexOf('=')
      const key = eq === -1 ? part : part.slice(0, eq)
      const value = eq === -1 ? '' : part.slice(eq + 1)
      return { key: decode(key), value: decode(value), enabled: true }
    })
}

/** `encodeURIComponent` everywhere except inside `{{…}}` spans, which stay verbatim. */
function encode(text: string): string {
  let out = ''
  let at = 0
  for (const v of findVariables(text)) {
    out += encodeURIComponent(text.slice(at, v.start)) + text.slice(v.start, v.end)
    at = v.end
  }
  return out + encodeURIComponent(text.slice(at))
}

/** Rebuilds the query from enabled rows only; keeps the base and the `#fragment`. */
export function applyParams(url: string, params: KeyValue[]): string {
  const { base, fragment } = splitUrl(url)
  const query = params
    .filter((p) => p.enabled && (p.key !== '' || p.value !== ''))
    .map((p) => `${encode(p.key)}=${encode(p.value)}`)
    .join('&')
  return `${base}${query ? `?${query}` : ''}${fragment}`
}
