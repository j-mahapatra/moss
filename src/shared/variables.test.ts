import { describe, expect, it } from 'vitest'
import { buildScope, findVariables, resolveTemplate } from './variables'

const scope = (o: Record<string, string>): Map<string, string> => new Map(Object.entries(o))

describe('resolveTemplate', () => {
  it('substitutes trimmed names', () => {
    expect(resolveTemplate('{{base}}/u/{{ id }}', scope({ base: 'https://a.io', id: '7' }))).toBe(
      'https://a.io/u/7'
    )
  })
  it('keeps unknown names literal', () => {
    expect(resolveTemplate('{{missing}}', scope({}))).toBe('{{missing}}')
  })
  it('is single pass', () => {
    expect(resolveTemplate('{{a}}', scope({ a: '{{b}}', b: 'x' }))).toBe('{{b}}')
  })
  it('is stable across repeated calls', () => {
    const s = scope({ a: '1' })
    expect(resolveTemplate('{{a}}', s)).toBe('1')
    expect(resolveTemplate('{{a}}', s)).toBe('1')
  })
})

describe('buildScope', () => {
  it('first layer wins', () => {
    const s = buildScope(
      [{ key: 'h', value: 'env', enabled: true }],
      [{ key: 'h', value: 'col', enabled: true }]
    )
    expect(s.get('h')).toBe('env')
  })
  it('skips disabled variables', () => {
    const s = buildScope(
      [{ key: 'h', value: 'env', enabled: false }],
      [{ key: 'h', value: 'col', enabled: true }]
    )
    expect(s.get('h')).toBe('col')
  })
  it('last enabled duplicate in a layer wins', () => {
    const s = buildScope([
      { key: 'h', value: '1', enabled: true },
      { key: 'h', value: '2', enabled: true },
      { key: 'h', value: '3', enabled: false }
    ])
    expect(s.get('h')).toBe('2')
  })
  it('names the resolved variables that come from secret rows', () => {
    const s = buildScope(
      [
        { key: ' token ', value: 't', enabled: true, secret: true },
        { key: 'off', value: 'x', enabled: false, secret: true }
      ],
      [
        { key: 'token', value: 'col', enabled: true },
        { key: 'host', value: 'h', enabled: true, secret: true },
        { key: 'plain', value: 'p', enabled: true }
      ]
    )
    expect([...s.secretNames].sort()).toEqual(['host', 'token'])
    expect(s.get('token')).toBe('t')
  })
  it('secretNames follows the row that resolves, not lower layers or overridden duplicates', () => {
    const s = buildScope(
      [
        { key: 'a', value: 'env', enabled: true },
        { key: 'b', value: '1', enabled: true, secret: true },
        { key: 'b', value: '2', enabled: true }
      ],
      [
        { key: 'a', value: 'col', enabled: true, secret: true },
        { key: 'b', value: 'col', enabled: true, secret: true }
      ]
    )
    expect(s.get('a')).toBe('env')
    expect(s.get('b')).toBe('2')
    expect(s.secretNames.size).toBe(0)
  })
  it('ignores blank keys and trims keys', () => {
    const s = buildScope([
      { key: '', value: 'x', enabled: true },
      { key: '   ', value: 'y', enabled: true },
      { key: ' base ', value: 'z', enabled: true }
    ])
    expect([...s.keys()]).toEqual(['base'])
    expect(resolveTemplate('{{base}}', s)).toBe('z')
  })
})

describe('findVariables', () => {
  it('returns spans with braces', () => {
    expect(findVariables('x{{a}}y{{ b }}')).toEqual([
      { name: 'a', start: 1, end: 6 },
      { name: 'b', start: 7, end: 14 }
    ])
    expect(findVariables('x{{a}}')).toHaveLength(1)
  })
  it('ignores empty variables', () => {
    expect(findVariables('{{}}')).toEqual([])
    expect(findVariables('{{ }}')).toEqual([])
  })
})
