import { describe, expect, it } from 'vitest'
import { duplicateEnvironment, newEnvironment } from './environments'
import { EnvironmentSchema } from './schemas'
import type { Environment } from './types'

describe('environments', () => {
  it('newEnvironment trims and falls back to a default name', () => {
    expect(newEnvironment('  ').name).toBe('New environment')
    expect(newEnvironment(' dev ').name).toBe('dev')
    const e = newEnvironment('dev')
    expect(EnvironmentSchema.safeParse(e).success).toBe(true)
    expect(e.variables).toEqual([])
    expect(e.schemaVersion).toBe(1)
  })

  it('duplicateEnvironment makes a new id, a copy name and deep-copied variables', () => {
    const src: Environment = {
      id: crypto.randomUUID(),
      name: 'dev',
      variables: [{ key: 'a', value: '1', enabled: true }],
      schemaVersion: 1
    }
    const d = duplicateEnvironment(src)
    expect(d.id).not.toBe(src.id)
    expect(d.name).toBe('dev copy')
    expect(d.variables).not.toBe(src.variables)
    expect(d.variables[0]).not.toBe(src.variables[0])
    expect(d.variables).toEqual(src.variables)
  })

  it('EnvironmentSchema round-trips and rejects a non-UUID id', () => {
    const e = newEnvironment('x')
    expect(EnvironmentSchema.parse(e)).toEqual(e)
    expect(EnvironmentSchema.safeParse({ ...e, id: 'nope' }).success).toBe(false)
  })
})
