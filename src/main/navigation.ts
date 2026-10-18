export function isAllowedNavigation(
  url: string,
  opts: { devUrl?: string; appFileUrl: string }
): boolean {
  try {
    const target = new URL(url)
    if (opts.devUrl) return target.origin === new URL(opts.devUrl).origin
    return target.protocol === 'file:' && target.pathname === new URL(opts.appFileUrl).pathname
  } catch {
    return false
  }
}
