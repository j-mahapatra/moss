import { safeStorage } from 'electron'
import { plainCipher, type Cipher } from './secret-codec'

export { plainCipher }

/**
 * Electron safeStorage (Keychain / DPAPI / libsecret). On macOS, isEncryptionAvailable() already
 * reads the Keychain (and can prompt), so availability is only probed on Linux, the one platform
 * that can lack a backend; elsewhere it is assumed and safeStorage is first touched by a real
 * encrypt/decrypt of a non-empty secret.
 */
export function electronCipher(platform: NodeJS.Platform = process.platform): Cipher {
  return {
    available: () => (platform === 'linux' ? safeStorage.isEncryptionAvailable() : true),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (buf) => safeStorage.decryptString(buf)
  }
}

/** MOSS_SECRETS=plain keeps dev and e2e runs off the keychain; packaged builds ignore it. */
export function chooseCipher(opts: {
  isPackaged: boolean
  env: Record<string, string | undefined>
  platform?: NodeJS.Platform
}): Cipher {
  return !opts.isPackaged && opts.env['MOSS_SECRETS'] === 'plain'
    ? plainCipher
    : electronCipher(opts.platform)
}
