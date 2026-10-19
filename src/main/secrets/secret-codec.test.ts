import { describe, expect, it } from 'vitest'
import type { Collection, Environment, RequestSpec } from '../../shared/types'
import { newRequestSpec } from '../../shared/types'
import {
  SEALED_PREFIX,
  SEAL_FAILED,
  createSecretCodec,
  plainCipher,
  plainCodec,
  storageNotices,
  type Cipher
} from './secret-codec'
import { fakeCipher } from './fake-cipher'

const ID = (n: number): string => `3f2b8c1e-4a5d-4e6f-8a7b-${n.toString(16).padStart(12, '0')}`
const req = (n: number, auth: RequestSpec['auth']): RequestSpec & { kind: 'request' } => ({
  ...newRequestSpec(),
  id: ID(n),
  auth,
  kind: 'request'
})
const collection = (): Collection => ({
  id: ID(100),
  name: 'C',
  schemaVersion: 1,
  variables: [
    { key: 'host', value: 'example.test', enabled: true },
    { key: 'apiKey', value: 'S3CR3T-1', enabled: true, secret: true },
    { key: 'shown', value: 'visible', enabled: true, secret: false },
    { key: 'blank', value: '', enabled: true, secret: true }
  ],
  items: [
    req(1, { type: 'bearer', token: 'S3CR3T-2' }),
    {
      id: ID(101),
      kind: 'folder',
      name: 'F1',
      items: [
        {
          id: ID(102),
          kind: 'folder',
          name: 'F2',
          items: [req(2, { type: 'basic', username: 'alice', password: 'S3CR3T-3' })]
        },
        req(3, { type: 'none' })
      ]
    }
  ]
})
const environment = (): Environment => ({
  id: ID(200),
  name: 'E',
  schemaVersion: 1,
  variables: [
    { key: 'token', value: 'S3CR3T-4', enabled: true, secret: true },
    { key: 'plain', value: 'open', enabled: false }
  ]
})

describe('createSecretCodec', () => {
  it('round-trips every secret field kind, including nested folders and requests', () => {
    const codec = createSecretCodec(fakeCipher())
    const c = collection()
    const sealed = codec.sealCollection(c)
    expect(JSON.stringify(sealed)).not.toMatch(/S3CR3T/)
    expect(codec.openCollection(sealed)).toEqual({ value: c, failed: 0, plaintext: false })

    const e = environment()
    const sealedEnv = codec.sealEnvironment(e)
    expect(JSON.stringify(sealedEnv)).not.toMatch(/S3CR3T/)
    expect(codec.openEnvironment(sealedEnv)).toEqual({ value: e, failed: 0, plaintext: false })

    const r = req(9, { type: 'bearer', token: 'S3CR3T-5' })
    const sealedReq = codec.sealRequest(r)
    expect(sealedReq.auth).toMatchObject({ type: 'bearer' })
    expect(JSON.stringify(sealedReq)).not.toMatch(/S3CR3T/)
    expect(codec.openRequest(sealedReq)).toEqual({ value: r, failed: 0, plaintext: false })
  })

  it('stores sealed values as enc:v1:<base64> and leaves non-secrets readable', () => {
    const sealed = createSecretCodec(fakeCipher()).sealCollection(collection())
    const vars = sealed.variables
    expect(vars[0]).toEqual({ key: 'host', value: 'example.test', enabled: true })
    expect(vars[1]?.value.startsWith(SEALED_PREFIX)).toBe(true)
    expect(Buffer.from((vars[1]?.value ?? '').slice(SEALED_PREFIX.length), 'base64').length).toBe(
      'FAKE'.length + 'S3CR3T-1'.length
    )
    expect(vars[2]).toEqual({ key: 'shown', value: 'visible', enabled: true, secret: false })
    expect(vars[3]?.value).toBe('')
    const first = sealed.items[0]
    expect(first?.kind === 'request' && first.auth.type === 'bearer' && first.auth.token).toMatch(
      /^enc:v1:/
    )
  })

  it('does not mutate its input', () => {
    const c = collection()
    const before = structuredClone(c)
    createSecretCodec(fakeCipher()).sealCollection(c)
    expect(c).toEqual(before)
  })

  it('never double-seals a stored document re-sealed with keepSealed', () => {
    const cipher = fakeCipher()
    const codec = createSecretCodec(cipher)
    const once = codec.sealEnvironment(environment())
    const twice = codec.sealEnvironment(once, { keepSealed: true })
    expect(twice).toEqual(once)
    expect(codec.openEnvironment(twice).value).toEqual(environment())
  })

  it('seals plaintext input that happens to start with enc:v1:, so it round-trips', () => {
    const codec = createSecretCodec(fakeCipher())
    const r = req(9, { type: 'bearer', token: 'enc:v1:abc' })
    const sealed = codec.sealRequest(r)
    expect(sealed.auth).not.toEqual(r.auth)
    expect(codec.openRequest(sealed).value).toEqual(r)
  })

  it('reports plaintext secret fields so the caller can migrate', () => {
    const codec = createSecretCodec(fakeCipher())
    expect(codec.openCollection(collection())).toEqual({
      value: collection(),
      failed: 0,
      plaintext: true
    })
    expect(codec.openEnvironment({ ...environment(), variables: [] }).plaintext).toBe(false)
  })

  it('opens an undecryptable enc:v1: value as an empty string and counts it', () => {
    const codec = createSecretCodec(fakeCipher())
    const e: Environment = {
      ...environment(),
      variables: [
        { key: 'a', value: `${SEALED_PREFIX}bm90LWZha2U=`, enabled: true, secret: true },
        { key: 'b', value: `${SEALED_PREFIX}!!!`, enabled: true, secret: true }
      ]
    }
    const opened = codec.openEnvironment(e)
    expect(opened.failed).toBe(2)
    expect(opened.plaintext).toBe(false)
    expect(opened.value.variables.map((v) => v.value)).toEqual(['', ''])
  })

  it('is lazy: no cipher calls for documents with no non-empty secrets', () => {
    const cipher = fakeCipher()
    const codec = createSecretCodec(cipher)
    const c: Collection = {
      ...collection(),
      variables: [
        { key: 'host', value: 'x', enabled: true },
        { key: 'blank', value: '', enabled: true, secret: true }
      ],
      items: [req(1, { type: 'bearer', token: '' }), req(2, { type: 'none' })]
    }
    codec.openCollection(codec.sealCollection(c))
    codec.openRequest(codec.sealRequest(req(3, { type: 'basic', username: 'u', password: '' })))
    expect(cipher.calls).toEqual({ encrypt: 0, decrypt: 0 })
  })

  it('stores plaintext when encryption is unavailable', () => {
    const cipher = fakeCipher({ available: false })
    const codec = createSecretCodec(cipher)
    expect(codec.available()).toBe(false)
    expect(codec.sealCollection(collection())).toEqual(collection())
    expect(cipher.calls).toEqual({ encrypt: 0, decrypt: 0 })
    expect(plainCodec.available()).toBe(false)
    expect(plainCodec.sealEnvironment(environment())).toEqual(environment())
    expect(plainCipher.available()).toBe(false)
  })

  it('never puts a secret value in an error', () => {
    const throwing: Cipher = {
      available: () => true,
      encrypt: () => {
        throw new Error('keychain locked')
      },
      decrypt: () => {
        throw new Error('keychain locked')
      }
    }
    const codec = createSecretCodec(throwing)
    expect(() => codec.sealEnvironment(environment())).toThrow(SEAL_FAILED)
    try {
      codec.sealEnvironment(environment())
    } catch (err) {
      expect(String(err)).not.toMatch(/S3CR3T/)
    }
  })
})

describe('storageNotices', () => {
  it('warns once-per-session text only when encryption is unavailable', () => {
    expect(storageNotices(createSecretCodec(fakeCipher()))).toEqual([])
    expect(storageNotices(plainCodec)).toEqual(['Secrets are stored unencrypted on this system.'])
  })
})
