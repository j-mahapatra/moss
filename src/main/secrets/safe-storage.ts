import { safeStorage } from 'electron'
import { plainCipher, type Cipher } from './secret-codec'

export { plainCipher }

/** Electron safeStorage (Keychain / DPAPI / libsecret). Nothing is called until first use. */
export function electronCipher(): Cipher {
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (buf) => safeStorage.decryptString(buf)
  }
}

/** MOSS_SECRETS=plain keeps dev and e2e runs off the keychain; packaged builds ignore it. */
export function chooseCipher(opts: {
  isPackaged: boolean
  env: Record<string, string | undefined>
}): Cipher {
  return !opts.isPackaged && opts.env['MOSS_SECRETS'] === 'plain' ? plainCipher : electronCipher()
}
