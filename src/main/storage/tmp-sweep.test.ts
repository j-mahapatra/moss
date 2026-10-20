import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onceSwept, sweepTmp } from './tmp-sweep'

const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-sweep-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('sweepTmp', () => {
  it('removes only <prefix>.<uuid>.tmp files', async () => {
    for (const n of [
      `history.jsonl.${U1}.tmp`,
      `settings.json.${U1}.tmp`,
      'history.jsonl.notauuid.tmp',
      'history.jsonl',
      `xhistory.jsonl.${U1}.tmp`,
      `history.jsonl.${U1}.tmp.bak`
    ])
      await writeFile(join(dir, n), 'x')
    await sweepTmp(dir, 'history.jsonl')
    expect((await readdir(dir)).sort()).toEqual(
      [
        `history.jsonl.${U1}.tmp.bak`,
        'history.jsonl',
        'history.jsonl.notauuid.tmp',
        `settings.json.${U1}.tmp`,
        `xhistory.jsonl.${U1}.tmp`
      ].sort()
    )
  })

  it('only removes names with a strict 8-4-4-4-12 hex uuid', async () => {
    const loose = [
      'history.jsonl.------------------------------------.tmp',
      'history.jsonl.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.tmp',
      'history.jsonl.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa-.tmp',
      'history.jsonl.aaaaaaaaa-aaa-4aaa-8aaa-aaaaaaaaaaaa.tmp'
    ]
    for (const n of loose) await writeFile(join(dir, n), 'x')
    await sweepTmp(dir, 'history.jsonl')
    expect((await readdir(dir)).sort()).toEqual([...loose].sort())
  })

  it('does not throw when the directory is missing', async () => {
    await expect(sweepTmp(join(dir, 'nope'), 'history.jsonl')).resolves.toBeUndefined()
  })
})

describe('onceSwept', () => {
  it('runs the sweep on the first call only, even while it is still running', async () => {
    let release!: () => void
    const sweep = vi.fn(() => new Promise<void>((r) => (release = r)))
    const once = onceSwept(sweep)
    const first = once()
    const second = once()
    await second
    expect(sweep).toHaveBeenCalledTimes(1)
    release()
    await first
    await once()
    expect(sweep).toHaveBeenCalledTimes(1)
  })
})
