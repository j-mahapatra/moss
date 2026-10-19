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
import { newRequestSpec, type HistoryEntry } from '../../shared/types'
import { WriteQueue } from './atomic-write'
import { HistoryRepo } from './history-repo'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-hist-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const real = { mkdir, writeFile, unlink, rename, readFile, appendFile }
const file = (): string => join(dir, 'history.jsonl')
const hex = (n: number): string => n.toString(16).padStart(12, '0')
const spec = newRequestSpec()
const entry = (n: number): HistoryEntry => ({
  id: `3f2b8c1e-4a5d-4e6f-8a7b-${hex(n)}`,
  at: '2026-10-19T10:00:00.000Z',
  request: spec,
  status: 200,
  durationMs: n
})
const lines = (entries: HistoryEntry[]): string =>
  entries.map((e) => JSON.stringify(e) + '\n').join('')
const fileLines = async (): Promise<string[]> =>
  (await readFile(file(), 'utf8')).split('\n').filter((l) => l !== '')

describe('HistoryRepo basics', () => {
  it('lists empty when the file is missing', async () => {
    expect(await new HistoryRepo(dir, new WriteQueue()).list()).toEqual({
      entries: [],
      warnings: []
    })
  })

  it('appends then lists newest first as one line per entry', async () => {
    const repo = new HistoryRepo(dir, new WriteQueue())
    await repo.append(entry(1))
    await repo.append(entry(2))
    expect((await repo.list()).entries).toEqual([entry(2), entry(1)])
    expect(await readFile(file(), 'utf8')).toBe(lines([entry(1), entry(2)]))
    expect((await new HistoryRepo(dir, new WriteQueue()).list()).entries).toEqual([
      entry(2),
      entry(1)
    ])
  })

  it('rejects an invalid entry without writing', async () => {
    const repo = new HistoryRepo(dir, new WriteQueue())
    await expect(repo.append({ ...entry(1), durationMs: -1 })).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })

  it('delete removes one entry atomically and is a no-op when absent', async () => {
    const repo = new HistoryRepo(dir, new WriteQueue())
    for (const n of [1, 2, 3]) await repo.append(entry(n))
    await repo.delete(entry(2).id)
    await repo.delete(entry(99).id)
    expect((await repo.list()).entries).toEqual([entry(3), entry(1)])
    expect(await readFile(file(), 'utf8')).toBe(lines([entry(1), entry(3)]))
    expect(await readdir(dir)).toEqual(['history.jsonl'])
  })

  it('clear rewrites to an empty file', async () => {
    const repo = new HistoryRepo(dir, new WriteQueue())
    await repo.append(entry(1))
    await repo.clear()
    expect((await repo.list()).entries).toEqual([])
    expect(await readFile(file(), 'utf8')).toBe('')
    expect(await readdir(dir)).toEqual(['history.jsonl'])
    await repo.append(entry(2))
    expect(await readFile(file(), 'utf8')).toBe(lines([entry(2)]))
  })

  it('does not update the cache when a delete write fails', async () => {
    const repo0 = new HistoryRepo(dir, new WriteQueue())
    await repo0.append(entry(1))
    const repo = new HistoryRepo(dir, new WriteQueue(), {
      ...real,
      rename: async (from: string, to: string) => {
        if (to === file()) throw new Error('crash')
        return rename(from, to)
      }
    })
    await expect(repo.delete(entry(1).id)).rejects.toThrow('crash')
    expect((await repo.list()).entries).toEqual([entry(1)])
    expect(await readdir(dir)).toEqual(['history.jsonl'])
  })
})

describe('HistoryRepo compaction (RF1)', () => {
  it('keeps the newest 500 of 600 lines and rewrites the file on first list', async () => {
    const all = Array.from({ length: 600 }, (_, i) => entry(i))
    await writeFile(file(), lines(all))
    const { entries, warnings } = await new HistoryRepo(dir, new WriteQueue()).list()
    expect(warnings).toEqual([])
    expect(entries).toHaveLength(HISTORY_CAP)
    expect(entries[0]).toEqual(entry(599))
    expect(entries[499]).toEqual(entry(100))
    expect(await fileLines()).toHaveLength(HISTORY_CAP)
    expect(await readdir(dir)).toEqual(['history.jsonl'])
  })

  it('does not rewrite a file that is within the cap', async () => {
    await writeFile(file(), lines([entry(1)]))
    let renames = 0
    const repo = new HistoryRepo(dir, new WriteQueue(), {
      ...real,
      rename: async (a: string, b: string) => {
        renames++
        return rename(a, b)
      }
    })
    await repo.list()
    expect(renames).toBe(0)
  })

  it('compacts at runtime during 1001 gated appends, keeping the newest 500', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let first = true
    let maxLines = 0
    const repo = new HistoryRepo(dir, new WriteQueue(), {
      ...real,
      appendFile: async (p: string, data: string, enc: 'utf8') => {
        if (first) {
          first = false
          await gate
        }
        await appendFile(p, data, enc)
        maxLines = Math.max(maxLines, (await fileLines()).length)
      }
    })
    const all = Array.from({ length: 1001 }, (_, i) => entry(i))
    const pending = all.map((e) => repo.append(e))
    await new Promise((r) => setTimeout(r, 10))
    release()
    await Promise.all(pending)
    expect(maxLines).toBeLessThanOrEqual(2 * HISTORY_CAP + 1)
    expect((await fileLines()).length).toBeLessThanOrEqual(2 * HISTORY_CAP)
    const { entries } = await repo.list()
    expect(entries).toHaveLength(HISTORY_CAP)
    expect(entries[0]).toEqual(entry(1000))
    expect(entries[499]).toEqual(entry(501))
    expect(await fileLines()).toHaveLength(HISTORY_CAP)
    expect(await readdir(dir)).toEqual(['history.jsonl'])
  })

  it('compacts correctly when append runs before any list()', async () => {
    await writeFile(file(), lines(Array.from({ length: 1000 }, (_, i) => entry(i))))
    const repo = new HistoryRepo(dir, new WriteQueue())
    await repo.append(entry(1000))
    // the first load trims to the cap, so the file is no longer near 2x
    expect(await fileLines()).toHaveLength(HISTORY_CAP + 1)
    const { entries } = await repo.list()
    expect(entries[0]).toEqual(entry(1000))
    expect(entries).toHaveLength(HISTORY_CAP)
  })
})

describe('HistoryRepo corrupt lines (RF2)', () => {
  it('keeps valid entries and quarantines torn and garbage lines', async () => {
    const good = [entry(1), entry(2), entry(3)]
    const torn = JSON.stringify(entry(4)).slice(0, 30)
    const text = `${JSON.stringify(good[0])}\nnot json at all\n${JSON.stringify(good[1])}\n${JSON.stringify(good[2])}\n${torn}`
    await writeFile(file(), text)
    const repo = new HistoryRepo(dir, new WriteQueue(), real, () => 42)
    const { entries, warnings } = await repo.list()
    expect(entries).toEqual([entry(3), entry(2), entry(1)])
    expect(warnings).toEqual([
      `Some history entries couldn't be read and were moved to "history.corrupt-42.jsonl".`
    ])
    expect(await readFile(join(dir, 'history.corrupt-42.jsonl'), 'utf8')).toBe(
      `not json at all\n${torn}\n`
    )
    expect(await readFile(file(), 'utf8')).toBe(lines(good))
    expect((await readdir(dir)).sort()).toEqual(['history.corrupt-42.jsonl', 'history.jsonl'])
    expect((await repo.list()).warnings).toEqual([])
  })

  it('treats schema-invalid JSON lines as invalid', async () => {
    await writeFile(file(), `${JSON.stringify({ id: 'x' })}\n${lines([entry(1)])}`)
    const { entries, warnings } = await new HistoryRepo(dir, new WriteQueue()).list()
    expect(entries).toEqual([entry(1)])
    expect(warnings).toHaveLength(1)
  })

  it('does not rewrite the history file when the quarantine write fails', async () => {
    const text = `bad\n${lines([entry(1)])}`
    await writeFile(file(), text)
    const repo = new HistoryRepo(dir, new WriteQueue(), {
      ...real,
      rename: async () => {
        throw new Error('crash')
      }
    })
    await expect(repo.list()).rejects.toThrow('crash')
    expect(await readFile(file(), 'utf8')).toBe(text)
    expect(await readdir(dir)).toEqual(['history.jsonl'])
  })
})

describe('HistoryRepo concurrency', () => {
  it('serializes interleaved appends and a delete without losing or duplicating lines', async () => {
    const repo = new HistoryRepo(dir, new WriteQueue())
    await repo.append(entry(0))
    const ops: Promise<void>[] = []
    for (let i = 1; i <= 10; i++) {
      ops.push(repo.append(entry(i)))
      if (i === 5) ops.push(repo.delete(entry(3).id))
    }
    await Promise.all(ops)
    const expected = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10].map(entry)
    expect(await readFile(file(), 'utf8')).toBe(lines(expected))
    expect((await repo.list()).entries).toEqual([...expected].reverse())
    expect(await readdir(dir)).toEqual(['history.jsonl'])
  })
})

describe('HistoryRepo torn tails', () => {
  it('rewrites a valid but unterminated last line so the next append does not glue onto it', async () => {
    await writeFile(file(), lines([entry(1)]).slice(0, -1))
    const repo = new HistoryRepo(dir, new WriteQueue())
    await repo.append(entry(2))
    expect(await readFile(file(), 'utf8')).toBe(lines([entry(1), entry(2)]))
    const fresh = await new HistoryRepo(dir, new WriteQueue()).list()
    expect(fresh.entries).toEqual([entry(2), entry(1)])
    expect(fresh.warnings).toEqual([])
  })

  it('reloads and quarantines the partial line after a failed append', async () => {
    let fail = true
    const repo = new HistoryRepo(
      dir,
      new WriteQueue(),
      {
        ...real,
        appendFile: async (p: string, data: string, enc: 'utf8') => {
          if (fail) {
            await appendFile(p, data.slice(0, 20), enc)
            throw new Error('disk full')
          }
          await appendFile(p, data, enc)
        }
      },
      () => 9
    )
    await repo.append(entry(1)).catch(() => undefined)
    fail = false
    await repo.append(entry(2))
    const fresh = await new HistoryRepo(dir, new WriteQueue()).list()
    expect(fresh.entries).toEqual([entry(2)])
    expect(await readFile(file(), 'utf8')).toBe(lines([entry(2)]))
    expect(await readFile(join(dir, 'history.corrupt-9.jsonl'), 'utf8')).toBe(
      JSON.stringify(entry(1)).slice(0, 20) + '\n'
    )
  })
})
