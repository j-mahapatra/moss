import type { KeyValue } from './types'

export type VariableScope = ReadonlyMap<string, string>

// Source string; a fresh RegExp is built per call so `lastIndex` never leaks.
const VAR_SOURCE = String.raw`\{\{\s*([^{}\s][^{}]*?)\s*\}\}`
const varRegex = (): RegExp => new RegExp(VAR_SOURCE, 'g')

/** Earlier layers take precedence; disabled and blank-key entries are ignored; keys are trimmed; last enabled duplicate in a layer wins. */
export function buildScope(...layers: KeyValue[][]): VariableScope {
  const scope = new Map<string, string>()
  for (const layer of layers) {
    const own = new Map<string, string>()
    for (const kv of layer) {
      const key = kv.key.trim()
      if (kv.enabled && key !== '') own.set(key, kv.value)
    }
    for (const [k, v] of own) if (!scope.has(k)) scope.set(k, v)
  }
  return scope
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
