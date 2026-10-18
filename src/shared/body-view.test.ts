import { describe, expect, it } from 'vitest'
import { defaultViewMode, pickBodyView } from './body-view'

const utf8 = new TextEncoder().encode('hello')

describe('pickBodyView', () => {
  it.each([
    ['application/json; charset=utf-8', 'json'],
    ['application/problem+json', 'json'],
    ['text/html', 'text'],
    ['application/soap+xml', 'text'],
    ['application/xml', 'text'],
    ['application/javascript', 'text'],
    ['IMAGE/PNG', 'image'],
    ['application/octet-stream', 'binary']
  ])('%s -> %s', (ct, expected) => {
    expect(pickBodyView(ct, utf8)).toBe(expected)
  })

  it('sniffs a missing type', () => {
    expect(pickBodyView(undefined, utf8)).toBe('text')
    expect(pickBodyView(undefined, new Uint8Array([0xff, 0xfe, 0x00]))).toBe('binary')
  })
})

describe('defaultViewMode', () => {
  it('opens large bodies in raw', () => {
    expect(defaultViewMode(3_000_000)).toBe('raw')
    expect(defaultViewMode(2 * 1024 * 1024)).toBe('pretty')
    expect(defaultViewMode(10)).toBe('pretty')
  })
})
