import { describe, expect, it } from 'vitest'
import { isAllowedNavigation } from './navigation'

const prod = { appFileUrl: 'file:///app/out/renderer/index.html' }
const opts = { devUrl: 'http://localhost:5173', appFileUrl: 'file:///app/out/renderer/index.html' }

describe('isAllowedNavigation', () => {
  it('allows the dev URL with a path', () => {
    expect(isAllowedNavigation('http://localhost:5173/foo?a=1', opts)).toBe(true)
  })
  it('denies a prefix-spoofed host', () => {
    expect(isAllowedNavigation('http://localhost:5173.evil.com/', opts)).toBe(false)
  })
  it('denies external sites', () => {
    expect(isAllowedNavigation('https://example.com', opts)).toBe(false)
  })
  it('allows the app file URL with a hash', () => {
    expect(isAllowedNavigation('file:///app/out/renderer/index.html#x', prod)).toBe(true)
  })
  it('denies a different file path', () => {
    expect(isAllowedNavigation('file:///etc/passwd', prod)).toBe(false)
  })
  it('denies malformed URLs', () => {
    expect(isAllowedNavigation('not a url', opts)).toBe(false)
  })
})
