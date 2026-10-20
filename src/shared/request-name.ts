import type { HttpMethod } from './types'

function pathOf(url: string): string {
  if (url.includes('{{')) return url
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`
  try {
    const u = new URL(candidate)
    return u.pathname + u.search
  } catch {
    return url
  }
}

/** Default request name derived from the method and the URL's path. */
export function requestNameFromUrl(method: HttpMethod, url: string): string {
  return `${method} ${pathOf(url)}`
}

const HTTP_METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export const isHttpMethod = (method: string): method is HttpMethod => HTTP_METHODS.includes(method)

/**
 * Name for a request that has none: `requestNameFromUrl` for a method Moss sends, otherwise
 * `${method} ${url}` with the url verbatim (used in reports for requests that were skipped).
 */
export function unnamedRequestName(method: string, url: string): string {
  return isHttpMethod(method) ? requestNameFromUrl(method, url) : `${method} ${url}`
}
