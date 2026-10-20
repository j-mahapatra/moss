import type {
  Collection,
  Environment,
  Item,
  RequestAuth,
  RequestSpec,
  Variable
} from '../../shared/types'

/** The slice of Electron's safeStorage the codec needs; tests inject a fake. */
export type Cipher = {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(buf: Buffer): string
}

/**
 * The result of opening a stored document. `failed` counts sealed values that would not decrypt
 * (they open as ''); `plaintext` reports a non-empty secret stored unsealed, so it needs migrating.
 */
export type Opened<T> = { value: T; failed: number; plaintext: boolean }

/**
 * `keepSealed` is for re-sealing a stored document (migration, rewrites): values already
 * `enc:v1:` are left as they are. Without it every non-empty secret is sealed, since input from
 * the renderer is always plaintext, even a value that happens to start with `enc:v1:`.
 */
export type SealOptions = { keepSealed?: boolean }

export type SecretCodec = {
  available(): boolean
  sealCollection(c: Collection, opts?: SealOptions): Collection
  openCollection(c: Collection): Opened<Collection>
  sealEnvironment(e: Environment, opts?: SealOptions): Environment
  openEnvironment(e: Environment): Opened<Environment>
  sealRequest(r: RequestSpec, opts?: SealOptions): RequestSpec
  openRequest(r: RequestSpec): Opened<RequestSpec>
}

export const SEALED_PREFIX = 'enc:v1:'

export const UNENCRYPTED_WARNING = 'Secrets are stored unencrypted on this system.'

/** Thrown when the cipher fails to seal; deliberately carries no detail about the value. */
export const SEAL_FAILED = "Couldn't encrypt a secret value"

export const decryptWarning = (n: number): string =>
  `Couldn't decrypt ${n} saved secret(s); enter them again.`

const unavailable = (): never => {
  throw new Error('Encryption is not available')
}

/** Stores secrets as plaintext. Used by tests and by MOSS_SECRETS=plain dev runs. */
export const plainCipher: Cipher = {
  available: () => false,
  encrypt: unavailable,
  decrypt: unavailable
}

type MapValue = (value: string) => string

const mapAuth = (a: RequestAuth, f: MapValue): RequestAuth =>
  a.type === 'bearer'
    ? { ...a, token: f(a.token) }
    : a.type === 'basic'
      ? { ...a, password: f(a.password) }
      : a

const mapRequest = <R extends RequestSpec>(r: R, f: MapValue): R => ({
  ...r,
  auth: mapAuth(r.auth, f)
})

const mapVariables = (vs: Variable[], f: MapValue): Variable[] =>
  vs.map((v) => (v.secret === true ? { ...v, value: f(v.value) } : v))

const mapItems = (items: Item[], f: MapValue): Item[] =>
  items.map((i) => (i.kind === 'folder' ? { ...i, items: mapItems(i.items, f) } : mapRequest(i, f)))

const mapCollection = (c: Collection, f: MapValue): Collection => ({
  ...c,
  variables: mapVariables(c.variables, f),
  items: mapItems(c.items, f)
})

const mapEnvironment = (e: Environment, f: MapValue): Environment => ({
  ...e,
  variables: mapVariables(e.variables, f)
})

/**
 * Seals and opens the secret fields of stored documents: every auth token and password, and
 * every variable marked `secret`. The cipher is only touched for non-empty secret values, so a
 * profile without secrets never reaches the keychain.
 */
export function createSecretCodec(cipher: Cipher): SecretCodec {
  const sealer =
    (opts: SealOptions = {}): MapValue =>
    (v) => {
      if (v === '' || (opts.keepSealed === true && v.startsWith(SEALED_PREFIX))) return v
      // Accepted edge case: in plain/unavailable mode a typed value that begins with `enc:v1:`
      // is stored as typed, so the next load treats it as sealed and it opens as ''.
      if (!cipher.available()) return v
      let sealed: Buffer
      try {
        sealed = cipher.encrypt(v)
      } catch {
        throw new Error(SEAL_FAILED)
      }
      return SEALED_PREFIX + sealed.toString('base64')
    }

  const opener =
    <T>(map: (x: T, f: MapValue) => T) =>
    (x: T): Opened<T> => {
      let failed = 0
      let plaintext = false
      const value = map(x, (v) => {
        if (!v.startsWith(SEALED_PREFIX)) {
          if (v !== '') plaintext = true
          return v
        }
        try {
          if (!cipher.available()) throw new Error('unavailable')
          return cipher.decrypt(Buffer.from(v.slice(SEALED_PREFIX.length), 'base64'))
        } catch {
          failed++
          return ''
        }
      })
      return { value, failed, plaintext }
    }

  return {
    available: () => cipher.available(),
    sealCollection: (c, opts) => mapCollection(c, sealer(opts)),
    openCollection: opener(mapCollection),
    sealEnvironment: (e, opts) => mapEnvironment(e, sealer(opts)),
    openEnvironment: opener(mapEnvironment),
    sealRequest: (r, opts) => mapRequest(r, sealer(opts)),
    openRequest: opener(mapRequest<RequestSpec>)
  }
}

/** The default for repos built without a codec (tests): secrets stay plaintext. */
export const plainCodec: SecretCodec = createSecretCodec(plainCipher)

/** Session-start warnings about how secrets are stored. */
export function storageNotices(codec: SecretCodec): string[] {
  return codec.available() ? [] : [UNENCRYPTED_WARNING]
}
