import { describe, expect, it } from 'vitest'
import { createWindowOptions } from './window-options'

describe('createWindowOptions', () => {
  it('locks down the renderer', () => {
    const o = createWindowOptions()
    expect(o.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
    expect(o.webPreferences?.preload).toMatch(/preload[\\/]index\.(m?js)$/)
    expect(o.minWidth).toBe(800)
    expect(o.minHeight).toBe(560)
  })
})
