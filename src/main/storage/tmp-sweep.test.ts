import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sweepTmp } from './tmp-sweep'

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

  it('does not throw when the directory is missing', async () => {
    await expect(sweepTmp(join(dir, 'nope'), 'history.jsonl')).resolves.toBeUndefined()
  })
})
