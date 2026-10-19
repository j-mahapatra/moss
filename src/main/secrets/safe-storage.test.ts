import { describe, expect, it, vi } from 'vitest'

// Never the real keychain: safeStorage is replaced wholesale.
const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`x${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString().slice(1))
}))
vi.mock('electron', () => ({ safeStorage }))

const { chooseCipher, electronCipher, plainCipher } = await import('./safe-storage')

describe('chooseCipher', () => {
  it('honours MOSS_SECRETS=plain only when unpackaged', () => {
    expect(chooseCipher({ isPackaged: false, env: { MOSS_SECRETS: 'plain' } })).toBe(plainCipher)
    expect(chooseCipher({ isPackaged: true, env: { MOSS_SECRETS: 'plain' } })).not.toBe(plainCipher)
    expect(chooseCipher({ isPackaged: false, env: {} })).not.toBe(plainCipher)
    expect(chooseCipher({ isPackaged: false, env: { MOSS_SECRETS: 'other' } })).not.toBe(
      plainCipher
    )
  })

  it('wraps safeStorage without calling it until used', () => {
    const c = chooseCipher({ isPackaged: true, env: {} })
    expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled()
    expect(c.available()).toBe(true)
    expect(c.decrypt(c.encrypt('v'))).toBe('v')
    expect(safeStorage.encryptString).toHaveBeenCalledWith('v')
    expect(electronCipher().available()).toBe(true)
  })

  it('plainCipher reports unavailable', () => {
    expect(plainCipher.available()).toBe(false)
  })
})
