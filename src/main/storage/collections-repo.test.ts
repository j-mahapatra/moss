import {
  appendFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  rename,
  unlink,
  writeFile
} from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deepEqual } from '../../shared/equal'
import type { Collection } from '../../shared/types'
import { WriteQueue } from './atomic-write'
import { CollectionsRepo } from './collections-repo'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'
const mk = (id: string, name: string): Collection => ({
  id,
  name,
  items: [],
  variables: [],
  schemaVersion: 1
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-col-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('CollectionsRepo', () => {
  it('round-trips save -> list', async () => {
    const repo = new CollectionsRepo(dir, new WriteQueue())
    const c: Collection = {
      ...mk(ID1, 'Alpha'),
      variables: [{ key: 'a', value: 'b', enabled: true }]
    }
    await repo.save(c)
    const fresh = new CollectionsRepo(dir, new WriteQueue())
    const { collections, warnings } = await fresh.list()
    expect(warnings).toEqual([])
    expect(collections).toHaveLength(1)
    expect(deepEqual(collections[0], c)).toBe(true)
  })

  it('sorts by name case-insensitively, then id', async () => {
    const repo = new CollectionsRepo(dir, new WriteQueue())
    await repo.save(mk(ID3, 'beta'))
    await repo.save(mk(ID2, 'Alpha'))
    await repo.save(mk(ID1, 'alpha'))
    const { collections } = await new CollectionsRepo(dir, new WriteQueue()).list()
    expect(collections.map((c) => c.id)).toEqual([ID1, ID2, ID3])
  })

  it('survives 20 concurrent saves of the same collection', async () => {
    const repo = new CollectionsRepo(dir, new WriteQueue())
    const versions = Array.from({ length: 20 }, (_, i) => mk(ID1, `v${i}`))
    await Promise.all(versions.map((v) => repo.save(v)))
    const file = join(dir, 'collections', `${ID1}.json`)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(versions[19])
    expect((await readdir(join(dir, 'collections'))).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(await repo.get(ID1)).toEqual(versions[19])
  })

  it('deletes, and deleting a missing id resolves', async () => {
    const repo = new CollectionsRepo(dir, new WriteQueue())
    await repo.save(mk(ID1, 'A'))
    await repo.delete(ID1)
    expect(await repo.get(ID1)).toBeNull()
    expect((await new CollectionsRepo(dir, new WriteQueue()).list()).collections).toEqual([])
    await expect(repo.delete(ID2)).resolves.toBeUndefined()
  })

  it('get reads from disk when not cached, null when missing or invalid', async () => {
    await new CollectionsRepo(dir, new WriteQueue()).save(mk(ID1, 'A'))
    const repo = new CollectionsRepo(dir, new WriteQueue())
    expect(await repo.get(ID1)).toEqual(mk(ID1, 'A'))
    expect(await repo.get(ID2)).toBeNull()
    await writeFile(join(dir, 'collections', `${ID3}.json`), '{bad')
    expect(await repo.get(ID3)).toBeNull()
    expect(await readdir(join(dir, 'collections'))).toContain(`${ID3}.json`)
  })

  it('quarantines corrupt and schema-invalid files with exact warnings', async () => {
    const cdir = join(dir, 'collections')
    await mkdir(cdir)
    await writeFile(join(cdir, `${ID1}.json`), '{not json')
    await writeFile(join(cdir, `${ID2}.json`), JSON.stringify({ id: ID2, name: 5 }))
    await new CollectionsRepo(dir, new WriteQueue(), undefined, () => 1234).save(mk(ID3, 'Ok'))
    const repo = new CollectionsRepo(dir, new WriteQueue(), undefined, () => 1234)
    const { collections, warnings } = await repo.list()
    expect(collections.map((c) => c.id)).toEqual([ID3])
    expect(warnings).toEqual([
      `Couldn't read "${ID1}.json". It was moved aside as "${ID1}.corrupt-1234.json".`,
      `Couldn't read "${ID2}.json". It was moved aside as "${ID2}.corrupt-1234.json".`
    ])
    const names = await readdir(cdir)
    expect(names).toContain(`${ID1}.corrupt-1234.json`)
    expect(names).toContain(`${ID2}.corrupt-1234.json`)
    expect(names).not.toContain(`${ID1}.json`)
  })

  it('quarantines an id/filename mismatch', async () => {
    const cdir = join(dir, 'collections')
    await mkdir(cdir)
    await writeFile(join(cdir, `${ID1}.json`), JSON.stringify(mk(ID2, 'X')))
    const repo = new CollectionsRepo(dir, new WriteQueue(), undefined, () => 9)
    const { collections, warnings } = await repo.list()
    expect(collections).toEqual([])
    expect(warnings).toEqual([
      `Couldn't read "${ID1}.json". It was moved aside as "${ID1}.corrupt-9.json".`
    ])
  })

  it('ignores stray files', async () => {
    const cdir = join(dir, 'collections')
    await mkdir(cdir)
    await writeFile(join(cdir, 'notes.txt'), 'hi')
    await writeFile(join(cdir, 'x.tmp'), 'hi')
    await writeFile(join(cdir, `${ID1}.json.abc.tmp`), 'hi')
    const { collections, warnings } = await new CollectionsRepo(dir, new WriteQueue()).list()
    expect(collections).toEqual([])
    expect(warnings).toEqual([])
    expect((await readdir(cdir)).sort()).toEqual(
      [`${ID1}.json.abc.tmp`, 'notes.txt', 'x.tmp'].sort()
    )
  })

  it('passes the injected fs through and keeps the original on failure', async () => {
    const repo0 = new CollectionsRepo(dir, new WriteQueue())
    await repo0.save(mk(ID1, 'Old'))
    const repo = new CollectionsRepo(dir, new WriteQueue(), {
      readFile,
      appendFile,
      mkdir,
      writeFile,
      unlink,
      rename: async () => {
        throw new Error('crash')
      }
    })
    await expect(repo.save(mk(ID1, 'New'))).rejects.toThrow('crash')
    expect((await new CollectionsRepo(dir, new WriteQueue()).get(ID1))?.name).toBe('Old')
    expect(await readdir(join(dir, 'collections'))).toEqual([`${ID1}.json`])
  })

  describe('fix round 1', () => {
    const real = { mkdir, writeFile, unlink, rename, readFile, appendFile }
    const deferred = (): { promise: Promise<void>; release: () => void } => {
      let release!: () => void
      const promise = new Promise<void>((r) => (release = r))
      return { promise, release }
    }

    it('still lists valid collections when a quarantine rename fails', async () => {
      const cdir = join(dir, 'collections')
      await mkdir(cdir)
      await writeFile(join(cdir, `${ID1}.json`), '{bad')
      await new CollectionsRepo(dir, new WriteQueue()).save(mk(ID2, 'Good'))
      const fs = {
        ...real,
        rename: async (from: string, to: string): Promise<void> => {
          if (to.includes('.corrupt-')) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
          return rename(from, to)
        }
      }
      const { collections, warnings } = await new CollectionsRepo(dir, new WriteQueue(), fs).list()
      expect(collections.map((c) => c.id)).toEqual([ID2])
      expect(warnings).toEqual([`Couldn't read "${ID1}.json". It was left in place.`])
      expect(await readdir(cdir)).toContain(`${ID1}.json`)
    })

    it('does not let a concurrent list() overwrite a newer save in the cache', async () => {
      await new CollectionsRepo(dir, new WriteQueue()).save(mk(ID1, 'v1'))
      await new CollectionsRepo(dir, new WriteQueue()).save(mk(ID2, 'other'))
      const gate = deferred()
      const fs = {
        ...real,
        readFile: async (p: string, enc: 'utf8'): Promise<string> => {
          if (p.includes(ID2)) await gate.promise
          return readFile(p, enc)
        }
      }
      const repo = new CollectionsRepo(dir, new WriteQueue(), fs)
      const listing = repo.list()
      await new Promise((r) => setTimeout(r, 20)) // list has read ID1 (v1), is parked on ID2
      await repo.save(mk(ID1, 'v2'))
      gate.release()
      const { collections } = await listing
      expect(collections.find((c) => c.id === ID1)?.name).toBe('v2')
      expect((await repo.get(ID1))?.name).toBe('v2')
    })

    it('does not resurrect a collection deleted during list()', async () => {
      await new CollectionsRepo(dir, new WriteQueue()).save(mk(ID1, 'gone'))
      await new CollectionsRepo(dir, new WriteQueue()).save(mk(ID2, 'other'))
      const gate = deferred()
      const fs = {
        ...real,
        readFile: async (p: string, enc: 'utf8'): Promise<string> => {
          if (p.includes(ID2)) await gate.promise
          return readFile(p, enc)
        }
      }
      const repo = new CollectionsRepo(dir, new WriteQueue(), fs)
      const listing = repo.list()
      await new Promise((r) => setTimeout(r, 20))
      await repo.delete(ID1)
      gate.release()
      const { collections } = await listing
      expect(collections.map((c) => c.id)).toEqual([ID2])
      expect(await repo.get(ID1)).toBeNull()
    })

    it('never moves a just-saved valid file aside while quarantining', async () => {
      const cdir = join(dir, 'collections')
      await mkdir(cdir)
      await writeFile(join(cdir, `${ID1}.json`), '{bad')
      const gate = deferred()
      const fs = {
        ...real,
        rename: async (from: string, to: string): Promise<void> => {
          if (to.includes('.corrupt-')) await gate.promise
          return rename(from, to)
        }
      }
      const repo = new CollectionsRepo(dir, new WriteQueue(), fs, () => 5)
      const listing = repo.list()
      await new Promise((r) => setTimeout(r, 20))
      const saving = repo.save(mk(ID1, 'fresh'))
      await new Promise((r) => setTimeout(r, 20))
      gate.release()
      await Promise.all([listing, saving])
      expect((await readdir(cdir)).sort()).toEqual([`${ID1}.corrupt-5.json`, `${ID1}.json`])
      expect(JSON.parse(await readFile(join(cdir, `${ID1}.json`), 'utf8')).name).toBe('fresh')
    })

    it('rejects path-traversal ids', async () => {
      await writeFile(join(dir, 'settings.json'), 'keep')
      const repo = new CollectionsRepo(dir, new WriteQueue())
      await expect(repo.delete('../settings')).rejects.toThrow('Invalid collection id')
      expect(await readFile(join(dir, 'settings.json'), 'utf8')).toBe('keep')
      await expect(repo.save(mk('../../x', 'Evil'))).rejects.toThrow('Invalid collection id')
      expect(await repo.get('../settings')).toBeNull()
      expect((await readdir(dir)).sort()).toEqual(['settings.json'])
      expect((await readdir(tmpdir())).includes('x.json')).toBe(false)
    })
  })
})
