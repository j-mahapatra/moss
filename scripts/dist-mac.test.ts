import { describe, expect, it } from 'vitest'
import { planBuild } from './dist-mac.mjs'

const APPLE_ID = {
  APPLE_ID: 'dev@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop',
  APPLE_TEAM_ID: 'TEAM123456'
}
const API_KEY = {
  APPLE_API_KEY: '/keys/AuthKey_ABC.p8',
  APPLE_API_KEY_ID: 'ABC',
  APPLE_API_ISSUER: 'issuer-uuid'
}

describe('planBuild', () => {
  it('builds unsigned when no signing identity is configured', () => {
    expect(planBuild({})).toEqual({ kind: 'unsigned' })
    expect(planBuild({ CSC_NAME: '', CSC_LINK: '', ...APPLE_ID })).toEqual({ kind: 'unsigned' })
  })

  it('fails listing both credential sets when none is given', () => {
    const plan = planBuild({ CSC_NAME: 'dummy' })
    expect(plan.kind).toBe('error')
    expect(plan.message).toContain(
      'Missing: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (or APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER).'
    )
    expect(plan.message).toMatch(/^CSC_NAME is set/)
  })

  it('names only the variables missing from a started Apple ID set', () => {
    const plan = planBuild({ CSC_LINK: '/certs/id.p12', APPLE_ID: 'dev@example.com' })
    expect(plan.kind).toBe('error')
    expect(plan.message).toMatch(/^CSC_LINK is set/)
    expect(plan.message).toContain('Missing: APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID.')
  })

  it('names only the variables missing from a started API key set', () => {
    const plan = planBuild({ CSC_NAME: 'dummy', APPLE_API_KEY_ID: 'ABC', APPLE_API_ISSUER: '' })
    expect(plan.message).toContain('Missing: APPLE_API_KEY, APPLE_API_ISSUER.')
  })

  it('follows electron-builder precedence: a partial Apple ID set wins over a full API key set', () => {
    const plan = planBuild({ CSC_NAME: 'dummy', APPLE_TEAM_ID: 'TEAM123456', ...API_KEY })
    expect(plan.message).toContain('Missing: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD.')
  })

  it('never echoes credential values in the message', () => {
    const plan = planBuild({
      CSC_LINK: 'c2VjcmV0LXAxMg==',
      APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh'
    })
    expect(plan.message).not.toContain('c2VjcmV0LXAxMg==')
    expect(plan.message).not.toContain('abcd-efgh')
  })

  it('signs with the named identity and notarizes when everything is present', () => {
    expect(planBuild({ CSC_NAME: 'Jane Doe (TEAM123456)', ...APPLE_ID })).toEqual({
      kind: 'signed',
      builderArgs: ['-c.mac.identity=Jane Doe (TEAM123456)', '-c.mac.notarize=true']
    })
  })

  it('leaves identity discovery to electron-builder when only CSC_LINK is set', () => {
    expect(planBuild({ CSC_LINK: '/certs/id.p12', ...API_KEY })).toEqual({
      kind: 'signed',
      builderArgs: ['-c.mac.identity=', '-c.mac.notarize=true']
    })
  })
})
