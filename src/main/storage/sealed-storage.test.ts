import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile
} from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HISTORY_CAP } from '../../shared/history'
import type { Collection, Environment, HistoryEntry, RequestSpec } from '../../shared/types'
import { newRequestSpec } from '../../shared/types'
import { fakeCipher } from '../secrets/fake-cipher'
import {
  SEALED_PREFIX,
  SEAL_FAILED,
  createSecretCodec,
  plainCodec,
  type Cipher
} from '../secrets/secret-codec'
import { WriteQueue, type AtomicFs } from './atomic-write'
import { CollectionsRepo } from './collections-repo'
import { EnvironmentsRepo } from './environments-repo'
import { HistoryRepo } from './history-repo'

const MARKER = /S3CR3T-\d+/
const DECRYPT_WARNING = (n: number): string =>
  `Couldn't decrypt ${n} saved secret(s); enter them again.`
const ID = (n: number): string => `3f2b8c1e-4a5d-4e6f-8a7b-${n.toString(16).padStart(12, '0')}`

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-sealed-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Real fs that records every byte written: tmp files, appends and the renamed-into-place result. */
function capturingFs(): AtomicFs & { writes: string[] } {
  const writes: string[] = []
  return {
    writes,
    mkdir,
    unlink,
    readFile,
    writeFile: async (p, d, e) => {
      writes.push(d)
      await writeFile(p, d, e)
    },
    appendFile: async (p, d, e) => {
      writes.push(d)
      await appendFile(p, d, e)
    },
    rename: async (from, to) => {
      await rename(from, to)
      writes.push(await readFile(to, 'utf8'))
    }
  }
}

async function allFiles(root: string): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = join(root, e.name)
    if (e.isDirectory()) out.push(...(await allFiles(p)))
    else out.push(await readFile(p, 'utf8'))
  }
  return out
}

const spec = (n: number, auth: RequestSpec['auth']): RequestSpec => ({
  ...newRequestSpec(),
  id: ID(n),
  name: `r${n}`,
  auth
})
const req = (n: number, auth: RequestSpec['auth']): RequestSpec & { kind: 'request' } => ({
  ...spec(n, auth),
  kind: 'request'
})
const collection = (id = ID(100)): Collection => ({
  id,
  name: 'C',
  schemaVersion: 1,
  variables: [
    { key: 'host', value: 'example.test', enabled: true },
    { key: 'apiKey', value: 'S3CR3T-1', enabled: true, secret: true },
    { key: 'shown', value: 'visible', enabled: true, secret: false }
  ],
  items: [
    req(1, { type: 'bearer', token: 'S3CR3T-2' }),
    {
      id: ID(101),
      kind: 'folder',
      name: 'F',
      items: [req(2, { type: 'basic', username: 'alice', password: 'S3CR3T-3' })]
    }
  ]
})
const environment = (id = ID(200)): Environment => ({
  id,
  name: 'E',
  schemaVersion: 1,
  variables: [
    { key: 'token', value: 'S3CR3T-4', enabled: true, secret: true },
    { key: 'region', value: 'eu', enabled: true }
  ]
})
const hEntry = (n: number): HistoryEntry => ({
  id: ID(1000 + n),
  at: '2026-10-19T10:00:00.000Z',
  request: spec(n, { type: 'bearer', token: `S3CR3T-${n}` }),
  status: 200,
  durationMs: n
})
const hPlain = (n: number): HistoryEntry => ({ ...hEntry(n), request: spec(n, { type: 'none' }) })

const colFile = (id = ID(100)): string => join(dir, 'collections', `${id}.json`)
const envFile = (id = ID(200)): string => join(dir, 'environments', `${id}.json`)
const histFile = (): string => join(dir, 'history.jsonl')

describe('sealed storage: plaintext never reaches disk', () => {
  it('saves, appends, compacts and migrates without writing a marker', async () => {
    const fs = capturingFs()
    const codec = createSecretCodec(fakeCipher())
    const q = new WriteQueue()

    // Legacy plaintext files that must be migrated on first load.
    await mkdir(join(dir, 'collections'), { recursive: true })
    await mkdir(join(dir, 'environments'), { recursive: true })
    await writeFile(colFile(ID(300)), JSON.stringify(collection(ID(300))))
    await writeFile(envFile(ID(301)), JSON.stringify(environment(ID(301))))
    await writeFile(
      histFile(),
      [hEntry(1), hEntry(2)].map((e) => JSON.stringify(e) + '\n').join('')
    )

    const cols = new CollectionsRepo(dir, q, fs, Date.now, codec)
    const envs = new EnvironmentsRepo(dir, q, fs, Date.now, codec)
    const hist = new HistoryRepo(dir, q, fs, Date.now, codec)

    expect((await cols.list()).collections).toEqual([collection(ID(300))])
    expect((await envs.list()).environments).toEqual([environment(ID(301))])
    expect((await hist.list()).entries).toEqual([hEntry(2), hEntry(1)])

    await cols.save(collection())
    await envs.save(environment())
    // Enough appends to force a runtime compaction.
    for (let n = 3; n <= 2 * HISTORY_CAP + 2; n++) await hist.append(hEntry(n))
    await hist.delete(hEntry(3).id)

    expect(fs.writes.length).toBeGreaterThan(2 * HISTORY_CAP)
    for (const w of fs.writes) expect(w).not.toMatch(MARKER)
    for (const f of await allFiles(dir)) expect(f).not.toMatch(MARKER)

    // Non-secret values and secret:false variables stay readable on disk.
    const onDisk = await readFile(colFile(), 'utf8')
    expect(onDisk).toContain('example.test')
    expect(onDisk).toContain('visible')
    expect(onDisk).toContain('alice')
    expect(onDisk).toContain(SEALED_PREFIX)

    // And everything opens again from a fresh session.
    const fresh = { q: new WriteQueue() }
    expect(
      (await new CollectionsRepo(dir, fresh.q, undefined, undefined, codec).list()).collections
    ).toEqual([collection(), collection(ID(300))])
    expect(
      await new CollectionsRepo(dir, fresh.q, undefined, undefined, codec).get(ID(100))
    ).toEqual(collection())
    expect(
      await new EnvironmentsRepo(dir, fresh.q, undefined, undefined, codec).get(ID(301))
    ).toEqual(environment(ID(301)))
    const reopened = await new HistoryRepo(dir, fresh.q, undefined, undefined, codec).list()
    expect(reopened.warnings).toEqual([])
    expect(reopened.entries[0]).toEqual(hEntry(2 * HISTORY_CAP + 2))
  })

  it('migrates a legacy file on get() too', async () => {
    await mkdir(join(dir, 'environments'), { recursive: true })
    await writeFile(envFile(), JSON.stringify(environment()))
    const repo = new EnvironmentsRepo(
      dir,
      new WriteQueue(),
      undefined,
      undefined,
      createSecretCodec(fakeCipher())
    )
    expect(await repo.get(ID(200))).toEqual(environment())
    expect(await readFile(envFile(), 'utf8')).not.toMatch(MARKER)
  })

  it('migrates history while compacting an over-cap legacy file', async () => {
    const legacy = Array.from({ length: HISTORY_CAP + 5 }, (_, i) => hEntry(i + 1))
    await writeFile(histFile(), legacy.map((e) => JSON.stringify(e) + '\n').join(''))
    const fs = capturingFs()
    const repo = new HistoryRepo(
      dir,
      new WriteQueue(),
      fs,
      Date.now,
      createSecretCodec(fakeCipher())
    )
    const { entries } = await repo.list()
    expect(entries).toHaveLength(HISTORY_CAP)
    expect(entries[0]).toEqual(hEntry(HISTORY_CAP + 5))
    expect(fs.writes).toHaveLength(2)
    for (const w of fs.writes) expect(w).not.toMatch(MARKER)
  })
})

describe('sealed storage: undecryptable values', () => {
  const BAD = `${SEALED_PREFIX}Z2FyYmFnZQ==`

  it('opens as empty, warns once per list, and never rewrites on a list-only session', async () => {
    await mkdir(join(dir, 'collections'), { recursive: true })
    await mkdir(join(dir, 'environments'), { recursive: true })
    const badCol: Collection = {
      ...collection(),
      variables: [{ key: 'k', value: BAD, enabled: true, secret: true }],
      items: [req(1, { type: 'bearer', token: BAD })]
    }
    const badEnv: Environment = {
      ...environment(),
      variables: [{ key: 'k', value: BAD, enabled: true, secret: true }]
    }
    await writeFile(colFile(), JSON.stringify(badCol))
    await writeFile(colFile(ID(102)), JSON.stringify({ ...badCol, id: ID(102), items: [] }))
    await writeFile(envFile(), JSON.stringify(badEnv))
    await writeFile(
      histFile(),
      JSON.stringify({
        ...hEntry(1),
        request: { ...hEntry(1).request, auth: { type: 'bearer', token: BAD } }
      }) + '\n'
    )
    const before = await allFiles(dir)

    const codec = createSecretCodec(fakeCipher())
    const q = new WriteQueue()
    const cols = new CollectionsRepo(dir, q, undefined, undefined, codec)
    const envs = new EnvironmentsRepo(dir, q, undefined, undefined, codec)
    const hist = new HistoryRepo(dir, q, undefined, undefined, codec)

    const c = await cols.list()
    expect(c.warnings).toEqual([DECRYPT_WARNING(3)])
    const opened = c.collections.find((x) => x.id === ID(100))
    expect(opened?.variables[0]?.value).toBe('')
    expect(opened?.items[0]).toMatchObject({ auth: { type: 'bearer', token: '' } })
    expect((await cols.list()).warnings).toEqual([DECRYPT_WARNING(3)])

    const e = await envs.list()
    expect(e.warnings).toEqual([DECRYPT_WARNING(1)])
    expect(await envs.get(ID(200))).toMatchObject({ variables: [{ value: '' }] })

    const h = await hist.list()
    expect(h.warnings).toEqual([DECRYPT_WARNING(1)])
    expect(h.entries[0]?.request.auth).toEqual({ type: 'bearer', token: '' })
    expect((await hist.list()).warnings).toEqual([])

    expect(await allFiles(dir)).toEqual(before)
  })

  it('keeps an undecryptable value byte-for-byte when migrating plaintext beside it', async () => {
    await mkdir(join(dir, 'environments'), { recursive: true })
    const mixed: Environment = {
      ...environment(),
      variables: [
        { key: 'old', value: BAD, enabled: true, secret: true },
        { key: 'new', value: 'S3CR3T-9', enabled: true, secret: true }
      ]
    }
    await writeFile(envFile(), JSON.stringify(mixed))
    const repo = new EnvironmentsRepo(
      dir,
      new WriteQueue(),
      undefined,
      undefined,
      createSecretCodec(fakeCipher())
    )
    const { environments, warnings } = await repo.list()
    expect(warnings).toEqual([DECRYPT_WARNING(1)])
    expect(environments[0]?.variables.map((v) => v.value)).toEqual(['', 'S3CR3T-9'])
    const disk = await readFile(envFile(), 'utf8')
    expect(disk).not.toMatch(MARKER)
    expect(JSON.parse(disk).variables[0].value).toBe(BAD)
  })

  it('quarantines an invalid file and history line with their original bytes', async () => {
    await mkdir(join(dir, 'collections'), { recursive: true })
    const sealed = createSecretCodec(fakeCipher()).sealCollection(collection())
    const broken = JSON.stringify({ ...sealed, schemaVersion: 99 })
    await writeFile(colFile(), broken)
    const sealedLine = JSON.stringify({
      ...hEntry(1),
      request: createSecretCodec(fakeCipher()).sealRequest(hEntry(1).request),
      durationMs: -1
    })
    await writeFile(histFile(), sealedLine + '\n')
    const codec = createSecretCodec(fakeCipher())
    const q = new WriteQueue()
    await new CollectionsRepo(dir, q, undefined, () => 5, codec).list()
    await new HistoryRepo(dir, q, undefined, () => 5, codec).list()
    expect(await readFile(join(dir, 'collections', `${ID(100)}.corrupt-5.json`), 'utf8')).toBe(
      broken
    )
    expect(await readFile(join(dir, 'history.corrupt-5.jsonl'), 'utf8')).toBe(sealedLine + '\n')
  })
})

describe('sealed storage: availability and laziness', () => {
  it('stores plaintext and never rewrites when encryption is unavailable', async () => {
    const cols = new CollectionsRepo(dir, new WriteQueue(), undefined, undefined, plainCodec)
    await cols.save(collection())
    const bytes = await readFile(colFile(), 'utf8')
    expect(bytes).toContain('S3CR3T-1')
    expect((await cols.list()).collections).toEqual([collection()])
    expect(await readFile(colFile(), 'utf8')).toBe(bytes)
  })

  it('makes no cipher calls for documents without non-empty secrets', async () => {
    const cipher = fakeCipher()
    const codec = createSecretCodec(cipher)
    const q = new WriteQueue()
    const cols = new CollectionsRepo(dir, q, undefined, undefined, codec)
    const envs = new EnvironmentsRepo(dir, q, undefined, undefined, codec)
    const hist = new HistoryRepo(dir, q, undefined, undefined, codec)
    await cols.save({
      ...collection(),
      variables: [{ key: 'a', value: '', enabled: true, secret: true }],
      items: [req(1, { type: 'none' })]
    })
    await envs.save({ ...environment(), variables: [{ key: 'a', value: 'b', enabled: true }] })
    await hist.append(hPlain(1))
    await cols.list()
    await cols.get(ID(100))
    await envs.list()
    await hist.list()
    await new HistoryRepo(dir, new WriteQueue(), undefined, undefined, codec).list()
    expect(cipher.calls).toEqual({ encrypt: 0, decrypt: 0 })
  })
})

describe('sealed storage: cipher failures and odd input', () => {
  // Keychain denied or locked: decrypt works for nothing, encrypt throws.
  const denied: Cipher = {
    available: () => true,
    encrypt: () => {
      throw new Error('keychain denied')
    },
    decrypt: () => {
      throw new Error('keychain denied')
    }
  }

  it('a save rejects without writing plaintext or putting the secret in the error', async () => {
    const fs = capturingFs()
    const repo = new CollectionsRepo(dir, new WriteQueue(), fs, Date.now, createSecretCodec(denied))
    const err = await repo.save(collection()).then(
      () => null,
      (e: unknown) => e
    )
    expect(String(err)).toBe(`Error: ${SEAL_FAILED}`)
    expect(fs.writes).toEqual([])
    const envs = new EnvironmentsRepo(
      dir,
      new WriteQueue(),
      fs,
      Date.now,
      createSecretCodec(denied)
    )
    await expect(envs.save(environment())).rejects.toThrow(SEAL_FAILED)
    expect(fs.writes).toEqual([])
  })

  it('a history append rejects without writing plaintext', async () => {
    const fs = capturingFs()
    const repo = new HistoryRepo(dir, new WriteQueue(), fs, Date.now, createSecretCodec(denied))
    await expect(repo.append(hEntry(1))).rejects.toThrow(SEAL_FAILED)
    await repo.append(hPlain(2))
    for (const w of fs.writes) expect(w).not.toMatch(MARKER)
    expect((await repo.list()).entries).toEqual([hPlain(2)])
  })

  it('history still loads when migration cannot seal, leaving the file as it was', async () => {
    const raw = [hEntry(1), hEntry(2)].map((e) => JSON.stringify(e) + '\n').join('')
    await writeFile(histFile(), raw)
    const repo = new HistoryRepo(
      dir,
      new WriteQueue(),
      undefined,
      undefined,
      createSecretCodec(denied)
    )
    const { entries, warnings } = await repo.list()
    expect(warnings).toEqual([])
    expect(entries).toEqual([hEntry(2), hEntry(1)])
    expect(await readFile(histFile(), 'utf8')).toBe(raw)
    await repo.delete(hEntry(1).id)
    expect((await repo.list()).entries).toEqual([hEntry(2)])
  })

  it('a collection or environment still loads when migration cannot seal', async () => {
    await mkdir(join(dir, 'environments'), { recursive: true })
    const raw = JSON.stringify(environment())
    await writeFile(envFile(), raw)
    const repo = new EnvironmentsRepo(
      dir,
      new WriteQueue(),
      undefined,
      undefined,
      createSecretCodec(denied)
    )
    expect((await repo.list()).environments).toEqual([environment()])
    expect(await readFile(envFile(), 'utf8')).toBe(raw)
  })

  it('a typed value that starts with enc:v1: round-trips through save and append', async () => {
    const codec = createSecretCodec(fakeCipher())
    const odd: Collection = {
      ...collection(),
      items: [req(1, { type: 'bearer', token: 'enc:v1:abc' })],
      variables: [{ key: 'k', value: 'enc:v1:xyz', enabled: true, secret: true }]
    }
    await new CollectionsRepo(dir, new WriteQueue(), undefined, undefined, codec).save(odd)
    const listed = await new CollectionsRepo(
      dir,
      new WriteQueue(),
      undefined,
      undefined,
      codec
    ).list()
    expect(listed).toEqual({ collections: [odd], warnings: [] })
    const e: HistoryEntry = {
      ...hEntry(1),
      request: spec(1, { type: 'bearer', token: 'enc:v1:abc' })
    }
    await new HistoryRepo(dir, new WriteQueue(), undefined, undefined, codec).append(e)
    const h = await new HistoryRepo(dir, new WriteQueue(), undefined, undefined, codec).list()
    expect(h).toEqual({ entries: [e], warnings: [] })
  })
})
