/** True on macOS (and iOS-family platforms), where the primary modifier is ⌘. */
export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.platform)

/** A shortcut label with the platform's primary modifier: `⌘K` on macOS, `Ctrl+K` elsewhere. */
export const modKey = (key: string): string => (isMac() ? `⌘${key}` : `Ctrl+${key}`)
