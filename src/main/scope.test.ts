import { describe, expect, it } from 'vitest'
import type { Collection, Environment, KeyValue } from '../shared/types'
import { createScopeResolver } from './scope'

const ENV = '11111111-1111-4111-8111-111111111111'
const COL = '22222222-2222-4222-8222-222222222222'
const kv = (key: string, value: string, enabled = true): KeyValue => ({ key, value, enabled })

function resolver(
  envVars: KeyValue[],
  colVars: KeyValue[]
): ReturnType<typeof createScopeResolver> {
  return createScopeResolver(
    { get: async (id) => (id === COL ? ({ variables: colVars } as Collection) : null) },
    { get: async (id) => (id === ENV ? ({ variables: envVars } as Environment) : null) }
  )
}

describe('createScopeResolver', () => {
  it('environment wins over collection', async () => {
    const s = await resolver(
      [kv('base', 'env')],
      [kv('base', 'col')]
    )({
      collectionId: COL,
      environmentId: ENV
    })
    expect(s.get('base')).toBe('env')
  })
  it('a disabled environment variable falls through to the collection', async () => {
    const s = await resolver(
      [kv('base', 'env', false)],
      [kv('base', 'col')]
    )({
      collectionId: COL,
      environmentId: ENV
    })
    expect(s.get('base')).toBe('col')
  })
  it('ignores blank-key rows', async () => {
    const s = await resolver([kv('', 'x'), kv('  ', 'y')], [])({ environmentId: ENV })
    expect(s.size).toBe(0)
  })
  it('unknown environmentId gives the collection-only scope', async () => {
    const s = await resolver(
      [kv('base', 'env')],
      [kv('base', 'col')]
    )({
      collectionId: COL,
      environmentId: '33333333-3333-4333-8333-333333333333'
    })
    expect(s.get('base')).toBe('col')
  })
  it('no ids give an empty scope', async () => {
    expect((await resolver([kv('a', '1')], [kv('b', '2')])({})).size).toBe(0)
  })
  it('rejects when a repo get rejects', async () => {
    const r = createScopeResolver(
      { get: async () => null },
      { get: () => Promise.reject(new Error('EIO')) }
    )
    await expect(r({ environmentId: ENV })).rejects.toThrow('EIO')
  })
})
