import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Environment } from '../../shared/types'
import { WriteQueue } from './atomic-write'
import { EnvironmentsRepo } from './environments-repo'

const ID1 = '11111111-1111-4111-8111-111111111111'
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-env-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('EnvironmentsRepo', () => {
  it('round-trips save -> list', async () => {
    const e: Environment = {
      id: ID1,
      name: 'Prod',
      variables: [{ key: 'host', value: 'x', enabled: true }],
      schemaVersion: 1
    }
    await new EnvironmentsRepo(dir, new WriteQueue()).save(e)
    const { environments, warnings } = await new EnvironmentsRepo(dir, new WriteQueue()).list()
    expect(warnings).toEqual([])
    expect(environments).toEqual([e])
    expect(await new EnvironmentsRepo(dir, new WriteQueue()).get(ID1)).toEqual(e)
  })

  it('rejects bad ids with Invalid environment id', async () => {
    const repo = new EnvironmentsRepo(dir, new WriteQueue())
    await expect(repo.delete('nope')).rejects.toThrow('Invalid environment id')
    await expect(
      repo.save({ id: '../x', name: 'n', variables: [], schemaVersion: 1 })
    ).rejects.toThrow('Invalid environment id')
  })
})
