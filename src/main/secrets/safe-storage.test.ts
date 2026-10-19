import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newRequestSpec } from '../../shared/types'
import { WriteQueue } from '../storage/atomic-write'
import { CollectionsRepo } from '../storage/collections-repo'
import { EnvironmentsRepo } from '../storage/environments-repo'
import { HistoryRepo } from '../storage/history-repo'
import { createSecretCodec, storageNotices } from './secret-codec'

// Never the real keychain: safeStorage is replaced wholesale.
const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`x${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString().slice(1))
}))
vi.mock('electron', () => ({ safeStorage }))

const { chooseCipher, electronCipher, plainCipher } = await import('./safe-storage')

beforeEach(() => vi.clearAllMocks())

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

  it('probes availability only on Linux', () => {
    expect(electronCipher('darwin').available()).toBe(true)
    expect(electronCipher('win32').available()).toBe(true)
    expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled()
    safeStorage.isEncryptionAvailable.mockReturnValueOnce(false)
    expect(electronCipher('linux').available()).toBe(false)
    expect(safeStorage.isEncryptionAvailable).toHaveBeenCalledOnce()
    const plainLinux = createSecretCodec(
      chooseCipher({ isPackaged: true, env: {}, platform: 'linux' })
    )
    safeStorage.isEncryptionAvailable.mockReturnValueOnce(false)
    expect(storageNotices(plainLinux)).toEqual(['Secrets are stored unencrypted on this system.'])
  })

  it('on macOS never touches safeStorage for a profile without secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'moss-lazy-'))
    try {
      const codec = createSecretCodec(
        chooseCipher({ isPackaged: true, env: {}, platform: 'darwin' })
      )
      expect(storageNotices(codec)).toEqual([])
      const q = new WriteQueue()
      const cols = new CollectionsRepo(dir, q, undefined, undefined, codec)
      const envs = new EnvironmentsRepo(dir, q, undefined, undefined, codec)
      const hist = new HistoryRepo(dir, q, undefined, undefined, codec)
      const id = '11111111-1111-4111-8111-111111111111'
      await cols.save({ id, name: 'C', items: [], variables: [], schemaVersion: 1 })
      await envs.save({
        id,
        name: 'E',
        variables: [{ key: 'a', value: 'b', enabled: true }],
        schemaVersion: 1
      })
      await hist.append({
        id,
        at: '2026-10-19T10:00:00.000Z',
        request: newRequestSpec(),
        status: 200,
        durationMs: 1
      })
      await new CollectionsRepo(dir, q, undefined, undefined, codec).list()
      await new EnvironmentsRepo(dir, q, undefined, undefined, codec).list()
      await new HistoryRepo(dir, q, undefined, undefined, codec).list()
      expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled()
      expect(safeStorage.encryptString).not.toHaveBeenCalled()
      expect(safeStorage.decryptString).not.toHaveBeenCalled()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('plainCipher reports unavailable', () => {
    expect(plainCipher.available()).toBe(false)
  })
})
