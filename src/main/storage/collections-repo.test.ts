import { mkdtemp, readFile, readdir, rm, unlink, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deepEqual } from '../../shared/equal'
import type { Collection } from '../../shared/types'
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
    const repo = new CollectionsRepo(dir)
    const c: Collection = {
      ...mk(ID1, 'Alpha'),
      variables: [{ key: 'a', value: 'b', enabled: true }]
    }
    await repo.save(c)
    const fresh = new CollectionsRepo(dir)
    const { collections, warnings } = await fresh.list()
    expect(warnings).toEqual([])
    expect(collections).toHaveLength(1)
    expect(deepEqual(collections[0], c)).toBe(true)
  })

  it('sorts by name case-insensitively, then id', async () => {
    const repo = new CollectionsRepo(dir)
    await repo.save(mk(ID3, 'beta'))
    await repo.save(mk(ID2, 'Alpha'))
    await repo.save(mk(ID1, 'alpha'))
    const { collections } = await new CollectionsRepo(dir).list()
    expect(collections.map((c) => c.id)).toEqual([ID1, ID2, ID3])
  })

  it('survives 20 concurrent saves of the same collection', async () => {
    const repo = new CollectionsRepo(dir)
    const versions = Array.from({ length: 20 }, (_, i) => mk(ID1, `v${i}`))
    await Promise.all(versions.map((v) => repo.save(v)))
    const file = join(dir, 'collections', `${ID1}.json`)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(versions[19])
    expect((await readdir(join(dir, 'collections'))).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(await repo.get(ID1)).toEqual(versions[19])
  })

  it('deletes, and deleting a missing id resolves', async () => {
    const repo = new CollectionsRepo(dir)
    await repo.save(mk(ID1, 'A'))
    await repo.delete(ID1)
    expect(await repo.get(ID1)).toBeNull()
    expect((await new CollectionsRepo(dir).list()).collections).toEqual([])
    await expect(repo.delete(ID2)).resolves.toBeUndefined()
  })

  it('get reads from disk when not cached, null when missing or invalid', async () => {
    await new CollectionsRepo(dir).save(mk(ID1, 'A'))
    const repo = new CollectionsRepo(dir)
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
    await new CollectionsRepo(dir, undefined, undefined, () => 1234).save(mk(ID3, 'Ok'))
    const repo = new CollectionsRepo(dir, undefined, undefined, () => 1234)
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
    const repo = new CollectionsRepo(dir, undefined, undefined, () => 9)
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
    const { collections, warnings } = await new CollectionsRepo(dir).list()
    expect(collections).toEqual([])
    expect(warnings).toEqual([])
    expect((await readdir(cdir)).sort()).toEqual(
      [`${ID1}.json.abc.tmp`, 'notes.txt', 'x.tmp'].sort()
    )
  })

  it('passes the injected fs through and keeps the original on failure', async () => {
    const repo0 = new CollectionsRepo(dir)
    await repo0.save(mk(ID1, 'Old'))
    const repo = new CollectionsRepo(dir, undefined, {
      mkdir,
      writeFile,
      unlink,
      rename: async () => {
        throw new Error('crash')
      }
    })
    await expect(repo.save(mk(ID1, 'New'))).rejects.toThrow('crash')
    expect((await new CollectionsRepo(dir).get(ID1))?.name).toBe('Old')
    expect(await readdir(join(dir, 'collections'))).toEqual([`${ID1}.json`])
  })
})
