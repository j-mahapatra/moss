import { appendFile, mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteJson, WriteQueue } from './atomic-write'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-aw-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('atomicWriteJson', () => {
  it('creates missing directories and round-trips content', async () => {
    const p = join(dir, 'a', 'b', 'x.json')
    await atomicWriteJson(p, { a: 1, b: [2] })
    expect(await readFile(p, 'utf8')).toBe(JSON.stringify({ a: 1, b: [2] }, null, 2) + '\n')
  })

  it('leaves no tmp file after success', async () => {
    await atomicWriteJson(join(dir, 'x.json'), { a: 1 })
    expect(await readdir(dir)).toEqual(['x.json'])
  })

  it('keeps the original and removes the tmp file when rename fails', async () => {
    const p = join(dir, 'x.json')
    await atomicWriteJson(p, { v: 1 })
    const failing = {
      readFile,
      appendFile,
      mkdir,
      writeFile,
      unlink,
      rename: async (): Promise<void> => {
        throw new Error('crash')
      }
    }
    await expect(atomicWriteJson(p, { v: 2 }, failing)).rejects.toThrow('crash')
    expect(JSON.parse(await readFile(p, 'utf8'))).toEqual({ v: 1 })
    expect(await readdir(dir)).toEqual(['x.json'])
  })

  it('ignores ENOENT from unlink during cleanup and rethrows the original error', async () => {
    const fs = {
      readFile,
      appendFile,
      mkdir,
      writeFile: async (): Promise<void> => {},
      unlink: async (): Promise<void> => {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' })
      },
      rename: async (): Promise<void> => {
        throw new Error('boom')
      }
    }
    await expect(atomicWriteJson(join(dir, 'x.json'), {}, fs)).rejects.toThrow('boom')
  })
})

describe('WriteQueue', () => {
  it('runs same-key tasks in order without overlap', async () => {
    const q = new WriteQueue()
    let active = 0
    let max = 0
    const order: number[] = []
    const gates: Array<() => void> = []
    const mk = (n: number): Promise<void> =>
      q.run('k', async () => {
        active++
        max = Math.max(max, active)
        await new Promise<void>((r) => gates.push(r))
        order.push(n)
        active--
      })
    const p1 = mk(1)
    const p2 = mk(2)
    await new Promise((r) => setTimeout(r, 5))
    expect(gates).toHaveLength(1)
    gates[0]!()
    await p1
    await new Promise((r) => setTimeout(r, 5))
    expect(gates).toHaveLength(2)
    gates[1]!()
    await p2
    expect(order).toEqual([1, 2])
    expect(max).toBe(1)
  })

  it('runs different keys in parallel', async () => {
    const q = new WriteQueue()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let bRan = false
    const a = q.run('a', () => gate)
    await q.run('b', async () => {
      bRan = true
    })
    expect(bRan).toBe(true)
    release()
    await a
  })

  it('does not let a rejected task block the next', async () => {
    const q = new WriteQueue()
    const a = q.run('k', () => Promise.reject(new Error('nope')))
    const b = q.run('k', async () => 'ok')
    await expect(a).rejects.toThrow('nope')
    await expect(b).resolves.toBe('ok')
  })
})

describe('WriteQueue.idle', () => {
  it('resolves right away when nothing is queued', async () => {
    await expect(new WriteQueue().idle()).resolves.toBeUndefined()
  })

  it('resolves only after every key has finished, including rejected tasks', async () => {
    const q = new WriteQueue()
    const done: string[] = []
    let releaseA!: () => void
    let releaseB!: () => void
    const a = q.run('a', async () => {
      await new Promise<void>((r) => (releaseA = r))
      done.push('a')
    })
    const b = q
      .run('b', async () => {
        await new Promise<void>((r) => (releaseB = r))
        done.push('b')
        throw new Error('nope')
      })
      .catch(() => undefined)
    let idle = false
    const waiting = q.idle().then(() => (idle = true))
    await new Promise((r) => setTimeout(r, 5))
    expect(idle).toBe(false)
    releaseA()
    await a
    await new Promise((r) => setTimeout(r, 5))
    expect(idle).toBe(false)
    releaseB()
    await waiting
    await b
    expect(done).toEqual(['a', 'b'])
    expect(idle).toBe(true)
  })
})
