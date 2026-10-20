import { describe, expect, it, vi } from 'vitest'
import { withParent } from './dialog-parent'

describe('withParent', () => {
  const show = vi.fn(async (...args: unknown[]) => args.length)

  it('attaches the dialog to the parent window when there is one', async () => {
    const win = { id: 1 }
    expect(await withParent(win, show, { title: 't' })).toBe(2)
    expect(show).toHaveBeenLastCalledWith(win, { title: 't' })
  })

  it('opens it unparented when there is no window', async () => {
    expect(await withParent(null, show, { title: 't' })).toBe(1)
    expect(show).toHaveBeenLastCalledWith({ title: 't' })
  })
})
