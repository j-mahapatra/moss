/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusAfterRemove, rowKeyHandler, useDeferredMenuAction } from './row-helpers'

type KeyInit = Partial<Pick<KeyboardEvent, 'key' | 'repeat' | 'metaKey' | 'ctrlKey' | 'shiftKey'>>

/** A keydown as React hands it to a row's handler; `from` is the element it came from. */
function keyEvent(row: HTMLElement, init: KeyInit, from: HTMLElement = row) {
  const preventDefault = vi.fn()
  const event = {
    key: '',
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
    target: from,
    currentTarget: row,
    preventDefault
  } as unknown as React.KeyboardEvent<HTMLElement>
  return { event, preventDefault }
}

function actions() {
  return {
    open: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
    rename: vi.fn<() => void>(),
    menu: vi.fn<() => void>()
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('rowKeyHandler', () => {
  it('binds Enter, Delete, Backspace, F2, ContextMenu and Shift+F10', () => {
    const row = document.createElement('div')
    const a = actions()
    const onKey = rowKeyHandler(a)
    for (const init of [
      { key: 'Enter' },
      { key: 'Delete' },
      { key: 'Backspace' },
      { key: 'F2' },
      { key: 'ContextMenu' },
      { key: 'F10', shiftKey: true }
    ]) {
      const { event, preventDefault } = keyEvent(row, init)
      onKey(event)
      expect(preventDefault).toHaveBeenCalled()
    }
    expect(a.open).toHaveBeenCalledTimes(1)
    expect(a.remove).toHaveBeenCalledTimes(2)
    expect(a.rename).toHaveBeenCalledTimes(1)
    expect(a.menu).toHaveBeenCalledTimes(2)
  })

  it('ignores a repeated Delete, Backspace or Enter', () => {
    const row = document.createElement('div')
    const a = actions()
    const onKey = rowKeyHandler(a)
    for (const key of ['Delete', 'Backspace', 'Enter']) {
      const { event, preventDefault } = keyEvent(row, { key, repeat: true })
      onKey(event)
      expect(preventDefault).not.toHaveBeenCalled()
    }
    expect(a.remove).not.toHaveBeenCalled()
    expect(a.open).not.toHaveBeenCalled()
  })

  it('ignores a key from an input inside the row', () => {
    const row = document.createElement('div')
    const input = document.createElement('input')
    row.append(input)
    const a = actions()
    const { event, preventDefault } = keyEvent(row, { key: 'Delete' }, input)
    rowKeyHandler(a)(event)
    expect(a.remove).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('ignores meta and ctrl combinations', () => {
    const row = document.createElement('div')
    const a = actions()
    const onKey = rowKeyHandler(a)
    onKey(keyEvent(row, { key: 'Delete', metaKey: true }).event)
    onKey(keyEvent(row, { key: 'Enter', ctrlKey: true }).event)
    expect(a.remove).not.toHaveBeenCalled()
    expect(a.open).not.toHaveBeenCalled()
  })

  it('leaves keys without an action, and unbound keys, unhandled', () => {
    const row = document.createElement('div')
    const onKey = rowKeyHandler({})
    for (const key of ['Delete', 'Enter', 'F2', 'F10', 'a']) {
      const { event, preventDefault } = keyEvent(row, { key })
      onKey(event)
      expect(preventDefault).not.toHaveBeenCalled()
    }
  })
})

describe('focusAfterRemove', () => {
  function rows(n: number): HTMLElement[] {
    return Array.from({ length: n }, () => {
      const el = document.createElement('div')
      el.tabIndex = 0
      document.body.append(el)
      return el
    })
  }

  it('focuses the next row, then the previous one, then the fallback', () => {
    const fallback = document.createElement('button')
    document.body.append(fallback)
    const [a, b, c] = rows(3) as [HTMLElement, HTMLElement, HTMLElement]

    focusAfterRemove([a, b, c], 1, fallback)
    expect(c).toHaveFocus()

    focusAfterRemove([a, b, c], 2, fallback)
    expect(b).toHaveFocus()

    focusAfterRemove([a], 0, fallback)
    expect(fallback).toHaveFocus()
  })

  it('does nothing without a neighbour or fallback', () => {
    const [a] = rows(1) as [HTMLElement]
    focusAfterRemove([a], 0, null)
    expect(document.body).toHaveFocus()
  })
})

describe('useDeferredMenuAction', () => {
  it('runs the chosen action when the menu closes, once', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDeferredMenuAction())
    act(() => result.current.wrap(fn, false)())
    expect(fn).not.toHaveBeenCalled()
    const e = new Event('focusout', { cancelable: true })
    act(() => result.current.onCloseAutoFocus(e))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(false)
    act(() => result.current.onCloseAutoFocus(new Event('focusout', { cancelable: true })))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('keeps focus off the trigger for an action that moves focus itself', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDeferredMenuAction())
    act(() => result.current.wrap(fn, true)())
    const e = new Event('focusout', { cancelable: true })
    act(() => result.current.onCloseAutoFocus(e))
    expect(e.defaultPrevented).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
