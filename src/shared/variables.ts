import type { Variable } from './types'

/** Resolved variable values by name: all that substitution needs. */
export type VariableScope = ReadonlyMap<string, string>

/**
 * A scope that also names the variables whose resolving row is secret, so displays can mask
 * them. A secret row in a lower layer, or an overridden duplicate, does not mark the name.
 */
export type SecretAwareScope = VariableScope & { readonly secretNames: ReadonlySet<string> }

/** A scope with no variables. */
export const emptyScope = (): SecretAwareScope => buildScope()

// Source string; a fresh RegExp is built per call so `lastIndex` never leaks.
const VAR_SOURCE = String.raw`\{\{\s*([^{}\s][^{}]*?)\s*\}\}`
const varRegex = (): RegExp => new RegExp(VAR_SOURCE, 'g')

/** Earlier layers take precedence; disabled and blank-key entries are ignored; keys are trimmed; last enabled duplicate in a layer wins. */
export function buildScope(...layers: Variable[][]): SecretAwareScope {
  const values = new Map<string, string>()
  const secretNames = new Set<string>()
  for (const layer of layers) {
    const own = new Map<string, Variable>()
    for (const kv of layer) {
      const key = kv.key.trim()
      if (kv.enabled && key !== '') own.set(key, kv)
    }
    for (const [k, kv] of own) {
      if (values.has(k)) continue
      values.set(k, kv.value)
      if (kv.secret === true) secretNames.add(k)
    }
  }
  return Object.assign(values, { secretNames })
}

/** Single-pass substitution; unknown names stay literal. */
export function resolveTemplate(text: string, scope: VariableScope): string {
  return text.replace(varRegex(), (whole, name: string) => {
    const v = scope.get(name)
    return v === undefined ? whole : v
  })
}

/** Spans cover the whole `{{…}}` (braces included); `end` is exclusive. */
export function findVariables(text: string): { name: string; start: number; end: number }[] {
  return [...text.matchAll(varRegex())].map((m) => ({
    name: m[1] as string,
    start: m.index,
    end: m.index + m[0].length
  }))
}
