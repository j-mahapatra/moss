import type { Environment } from './types'

export function newEnvironment(name: string): Environment {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'New environment',
    variables: [],
    schemaVersion: 1
  }
}

export function duplicateEnvironment(e: Environment): Environment {
  return {
    id: crypto.randomUUID(),
    name: `${e.name} copy`,
    variables: e.variables.map((v) => ({ ...v })),
    schemaVersion: 1
  }
}
