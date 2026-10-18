import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { palette, renderTokensCss, tokenNames } from './tokens'

describe('tokens.css', () => {
  it('equals freshly generated output (run `npm run gen:tokens`)', () => {
    const committed = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')
    expect(committed).toBe(renderTokensCss(palette))
  })

  it('defines every token for both themes under data-theme selectors', () => {
    const css = renderTokensCss(palette)
    expect(css).toContain(':root[data-theme="light"]')
    expect(css).toContain(':root[data-theme="dark"]')
    for (const name of tokenNames) {
      const matches = css.match(new RegExp(`--moss-${name}:`, 'g')) ?? []
      expect(matches, name).toHaveLength(2)
    }
  })
})
