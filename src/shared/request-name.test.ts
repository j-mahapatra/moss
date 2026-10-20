import { describe, expect, it } from 'vitest'
import { requestNameFromUrl, unnamedRequestName } from './request-name'

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

describe('unnamedRequestName', () => {
  it('names a supported method from the url path', () => {
    expect(unnamedRequestName('GET', 'https://a.io/users/42?x=1')).toBe('GET /users/42?x=1')
  })
  it('keeps the whole url for a method Moss does not send', () => {
    expect(unnamedRequestName('TRACE', 'https://a.io/users/42?x=1')).toBe(
      'TRACE https://a.io/users/42?x=1'
    )
  })
})
