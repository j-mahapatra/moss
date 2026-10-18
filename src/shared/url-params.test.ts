import { describe, expect, it } from 'vitest'
import { applyParams, parseQuery } from './url-params'

describe('parseQuery', () => {
  it('decodes enabled rows and ignores the fragment', () => {
    expect(parseQuery('{{base}}/u?a=1&b=x%20y#top')).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: 'x y', enabled: true }
    ])
  })
  it('falls back to raw text on malformed escapes', () => {
    expect(parseQuery('u?bad=%E0%A4%A')).toEqual([{ key: 'bad', value: '%E0%A4%A', enabled: true }])
  })
  it('returns nothing without a query', () => {
    expect(parseQuery('https://a.io/p')).toEqual([])
    expect(parseQuery('https://a.io/p?')).toEqual([])
  })
})

describe('applyParams', () => {
  it('rebuilds the query from enabled rows and keeps the fragment', () => {
    expect(
      applyParams('{{base}}/u?old=1#top', [
        { key: 'q', value: 'a b', enabled: true },
        { key: 'off', value: '1', enabled: false }
      ])
    ).toBe('{{base}}/u?q=a%20b#top')
  })
  it('keeps {{vars}} verbatim and works without a scheme', () => {
    expect(applyParams('x', [{ key: 't', value: '{{tok}}', enabled: true }])).toBe('x?t={{tok}}')
  })
  it('drops the ? when no enabled params remain', () => {
    expect(applyParams('x?a=1#f', [])).toBe('x#f')
    expect(applyParams('x?a=1', [{ key: 'a', value: '1', enabled: false }])).toBe('x')
  })
  it('writes empty values as k=', () => {
    expect(applyParams('x', [{ key: 'k', value: '', enabled: true }])).toBe('x?k=')
  })
  it('round trips', () => {
    const u = 'https://a.io/p?x=1&y=2'
    expect(applyParams(u, parseQuery(u))).toBe(u)
  })
})
