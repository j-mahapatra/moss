import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = resolve(__dirname, '..')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

/** Rule bodies (text between braces) that set `color: var(--moss-accent-text)`. */
function accentTextRules(css: string): string[] {
  return [...css.matchAll(/\{([^{}]*)\}/g)]
    .map((m) => m[1] ?? '')
    .filter((body) => /color:\s*var\(--moss-accent-text\)/.test(body))
}

// --moss-accent-text is designed for text on the solid accent fill only; on any other surface
// it is near-invisible in one theme or the other.
describe('accent-text guard', () => {
  it('uses --moss-accent-text only on a --moss-accent background', () => {
    const offenders = walk(rendererRoot)
      .filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'))
      .flatMap((f) =>
        accentTextRules(readFileSync(f, 'utf8'))
          .filter((body) => !/background(-color)?:\s*var\(--moss-accent\)/.test(body))
          .map(() => relative(rendererRoot, f))
      )
    expect(offenders).toEqual([])
  })
})
