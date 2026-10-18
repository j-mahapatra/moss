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
