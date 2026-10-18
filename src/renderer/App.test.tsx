import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noopExtras } from './state/test-api'
import App from './App'

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads collections and settings once on mount', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }))
    const extras = noopExtras()
    vi.stubGlobal('api', {
      'request:send': vi.fn(),
      'request:cancel': vi.fn(),
      ...extras
    })
    render(<App />)
    await waitFor(() => expect(extras['collections:list']).toHaveBeenCalledTimes(1))
    expect(extras['settings:get']).toHaveBeenCalledTimes(1)
  })
})
