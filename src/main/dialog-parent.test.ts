import { describe, expect, it, vi } from 'vitest'
import { focusedDialog, withParent, type DialogFn } from './dialog-parent'

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

describe('focusedDialog', () => {
  it('looks up the dialog function and the parent at each call, not at creation', async () => {
    const first = vi.fn(async () => 'first')
    const second = vi.fn(async () => 'second')
    const holder = { show: first as DialogFn<object, { title: string }, string> }
    let parent: object | null = null
    const open = focusedDialog(
      () => parent,
      () => holder.show
    )
    expect(await open({ title: 'a' })).toBe('first')
    holder.show = second
    parent = { id: 2 }
    expect(await open({ title: 'b' })).toBe('second')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith(parent, { title: 'b' })
  })
})
