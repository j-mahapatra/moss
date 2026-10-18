import { describe, expect, it } from 'vitest'
import { deepEqual } from './equal'

describe('deepEqual', () => {
  it('ignores key order in nested objects', () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2], d: 'x' } }, { b: { d: 'x', c: [1, 2] }, a: 1 })).toBe(
      true
    )
  })
  it('treats array order as significant', () => {
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false)
  })
  it('treats undefined and a missing key as equal', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true)
  })
  it('distinguishes differing values, types and lengths', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual([1], [1, 2])).toBe(false)
    expect(deepEqual(null, {})).toBe(false)
    expect(deepEqual([], {})).toBe(false)
    expect(deepEqual('1', 1)).toBe(false)
  })
})
