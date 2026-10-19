import { mkdtemp, mkdir, readFile, readdir, rm, rename, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { z } from 'zod'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WriteQueue } from './atomic-write'
import { DocRepo } from './doc-repo'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UP = 'ABCDEFAB-ABCD-4BCD-8BCD-ABCDEFABCDEF'
const Schema = z.object({ id: z.string(), name: z.string() })
type Doc = z.infer<typeof Schema>
const mk = (id: string, name: string): Doc => ({ id, name })
const real = { mkdir, writeFile, unlink, rename, readFile }
const deferred = (): { promise: Promise<void>; release: () => void } => {
  let release!: () => void
  const promise = new Promise<void>((r) => (release = r))
  return { promise, release }
}

let dir: string
const make = (o: Partial<ConstructorParameters<typeof DocRepo<Doc>>[0]> = {}): DocRepo<Doc> =>
  new DocRepo<Doc>({
    dataDir: dir,
    subdir: 'things',
    schema: Schema,
    label: 'thing',
    queue: new WriteQueue(),
    ...o
  })
const tdir = (): string => join(dir, 'things')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-doc-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('DocRepo', () => {
  it('round-trips and sorts by name then id', async () => {
    const repo = make()
    await repo.save(mk(ID3, 'beta'))
    await repo.save(mk(ID2, 'Alpha'))
    await repo.save(mk(ID1, 'alpha'))
    const { values, warnings } = await make().list()
    expect(warnings).toEqual([])
    expect(values.map((v) => v.id)).toEqual([ID1, ID2, ID3])
  })

  it('last write wins across 20 concurrent saves', async () => {
    const repo = make()
    const versions = Array.from({ length: 20 }, (_, i) => mk(ID1, `v${i}`))
    await Promise.all(versions.map((v) => repo.save(v)))
    expect(JSON.parse(await readFile(join(tdir(), `${ID1}.json`), 'utf8'))).toEqual(versions[19])
    expect(await repo.get(ID1)).toEqual(versions[19])
  })

  it('quarantines with exact warnings, and reports when quarantine fails', async () => {
    await mkdir(tdir())
    await writeFile(join(tdir(), `${ID1}.json`), '{bad')
    await make().save(mk(ID2, 'Good'))
    const { values, warnings } = await make({ now: () => 7 }).list()
    expect(values.map((v) => v.id)).toEqual([ID2])
    expect(warnings).toEqual([
      `Couldn't read "${ID1}.json". It was moved aside as "${ID1}.corrupt-7.json".`
    ])
    await writeFile(join(tdir(), `${ID3}.json`), '{bad')
    const fs = {
      ...real,
      rename: async (from: string, to: string): Promise<void> => {
        if (to.includes('.corrupt-')) throw new Error('busy')
        return rename(from, to)
      }
    }
    const r = await make({ fsImpl: fs }).list()
    expect(r.values.map((v) => v.id)).toEqual([ID2])
    expect(r.warnings).toEqual([`Couldn't read "${ID3}.json". It was left in place.`])
  })

  it('list does not overwrite a newer save, nor resurrect a delete', async () => {
    await make().save(mk(ID1, 'v1'))
    await make().save(mk(ID2, 'other'))
    await make().save(mk(ID3, 'third'))
    const gate = deferred()
    const fs = {
      ...real,
      readFile: async (p: string, enc: 'utf8'): Promise<string> => {
        if (p.includes(ID3)) await gate.promise
        return readFile(p, enc)
      }
    }
    const repo = make({ fsImpl: fs })
    const listing = repo.list()
    await new Promise((r) => setTimeout(r, 20))
    await repo.save(mk(ID1, 'v2'))
    await repo.delete(ID2)
    gate.release()
    const { values } = await listing
    expect(values.map((v) => `${v.id}:${v.name}`)).toEqual([`${ID3}:third`, `${ID1}:v2`])
    expect(await repo.get(ID2)).toBeNull()
  })

  it('rejects invalid ids with the label', async () => {
    const repo = make()
    await expect(repo.delete('../x')).rejects.toThrow('Invalid thing id')
    await expect(repo.save(mk('../../x', 'E'))).rejects.toThrow('Invalid thing id')
    expect(await repo.get('../x')).toBeNull()
  })

  it('maps an uppercase id to the lowercase file and persists the lowercase id', async () => {
    const repo = make()
    await repo.save(mk(UP, 'Up'))
    const lower = UP.toLowerCase()
    expect(await readdir(tdir())).toEqual([`${lower}.json`])
    expect(JSON.parse(await readFile(join(tdir(), `${lower}.json`), 'utf8'))).toEqual(
      mk(lower, 'Up')
    )
    expect(await make().get(UP)).toEqual(mk(lower, 'Up'))
    await repo.delete(UP)
    expect(await readdir(tdir())).toEqual([])
  })

  it('ignores uppercase-named files without warning or touching them', async () => {
    await mkdir(tdir())
    const name = `${UP}.json`
    await writeFile(join(tdir(), name), '{bad')
    const { values, warnings } = await make().list()
    expect(values).toEqual([])
    expect(warnings).toEqual([])
    expect(await readdir(tdir())).toEqual([name])
    expect(await readFile(join(tdir(), name), 'utf8')).toBe('{bad')
  })

  describe('tmp sweep', () => {
    it('removes orphan tmp files on the first list only; leaves others', async () => {
      await mkdir(tdir())
      const orphan = `${ID1}.json.${UUID_A}.tmp`
      const keep = ['notes.txt', 'x.tmp', `${ID1}.json.abc.tmp`]
      await writeFile(join(tdir(), orphan), 'x')
      for (const k of keep) await writeFile(join(tdir(), k), 'x')
      const repo = make()
      await repo.list()
      expect((await readdir(tdir())).sort()).toEqual([...keep].sort())
      const later = `${ID2}.json.${UUID_A}.tmp`
      await writeFile(join(tdir(), later), 'x')
      await repo.list()
      expect(await readdir(tdir())).toContain(later)
    })

    it('does not remove the tmp file of an in-flight write', async () => {
      await mkdir(tdir())
      const gate = deferred()
      const fs = {
        ...real,
        rename: async (from: string, to: string): Promise<void> => {
          await gate.promise
          return rename(from, to)
        }
      }
      const repo = make({ fsImpl: fs })
      const saving = repo.save(mk(ID1, 'inflight'))
      await new Promise((r) => setTimeout(r, 20))
      expect((await readdir(tdir())).some((f) => f.endsWith('.tmp'))).toBe(true)
      const listing = repo.list()
      await new Promise((r) => setTimeout(r, 20))
      expect((await readdir(tdir())).some((f) => f.endsWith('.tmp'))).toBe(true)
      gate.release()
      await Promise.all([saving, listing])
      expect(JSON.parse(await readFile(join(tdir(), `${ID1}.json`), 'utf8')).name).toBe('inflight')
      expect(await readdir(tdir())).toEqual([`${ID1}.json`])
    })
  })
})
