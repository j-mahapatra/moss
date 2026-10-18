import { describe, expect, it } from 'vitest'
import { requestNameFromUrl } from './request-name'

describe('requestNameFromUrl', () => {
  it('uses path and query of an absolute URL', () => {
    expect(requestNameFromUrl('GET', 'https://a.io/users/42?x=1')).toBe('GET /users/42?x=1')
  })
  it('handles a URL without a scheme', () => {
    expect(requestNameFromUrl('POST', 'localhost:3000/x')).toBe('POST /x')
  })
  it('falls back to the raw URL when it cannot be parsed', () => {
    expect(requestNameFromUrl('GET', '{{base}}/u')).toBe('GET {{base}}/u')
  })
})
