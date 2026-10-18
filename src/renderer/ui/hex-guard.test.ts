import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = resolve(__dirname, '..')
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z_-])/gi

function findHexLiterals(source: string): string[] {
  // HTML numeric entities (&#123;) are not colors.
  return source.replace(/&#\d+;/g, '').match(HEX) ?? []
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

describe('hex-literal guard', () => {
  it('detects #rgb, #rrggbb and #rrggbbaa but not ids or entities', () => {
    expect(findHexLiterals('color: #fff; background: #1a2b3c; border-color: #1a2b3c80;')).toEqual([
      '#fff',
      '#1a2b3c',
      '#1a2b3c80'
    ])
    expect(findHexLiterals('a[href="#main-nav"] &#123; #root')).toEqual([])
  })

  it('finds no hex colors in renderer CSS or TSX outside tokens.css', () => {
    const files = walk(rendererRoot).filter(
      (f) => (f.endsWith('.css') && !f.endsWith('tokens.css')) || f.endsWith('.tsx')
    )
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.flatMap((f) =>
      findHexLiterals(readFileSync(f, 'utf8')).map((hex) => `${relative(rendererRoot, f)}: ${hex}`)
    )
    expect(offenders).toEqual([])
  })
})
