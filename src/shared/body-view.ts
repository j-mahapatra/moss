export type BodyViewKind = 'json' | 'text' | 'image' | 'binary'
export type ViewMode = 'pretty' | 'raw'

export const LARGE_BODY_BYTES = 2 * 1024 * 1024

export function mediaType(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

export function pickBodyView(contentType: string | undefined, bytes: Uint8Array): BodyViewKind {
  const type = mediaType(contentType)
  if (!type) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return 'text'
    } catch {
      return 'binary'
    }
  }
  if (type === 'application/json' || type.endsWith('+json')) return 'json'
  if (
    type.startsWith('text/') ||
    type === 'application/xml' ||
    type.endsWith('+xml') ||
    type === 'application/javascript'
  ) {
    return 'text'
  }
  if (type.startsWith('image/')) return 'image'
  return 'binary'
}

export function defaultViewMode(size: number): ViewMode {
  return size > LARGE_BODY_BYTES ? 'raw' : 'pretty'
}
