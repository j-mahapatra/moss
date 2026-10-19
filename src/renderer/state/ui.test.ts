import { describe, expect, it } from 'vitest'
import { noopExtras } from './test-api'
import { createWorkspaceStore } from './workspace'

const make = (): ReturnType<typeof createWorkspaceStore> =>
  createWorkspaceStore({
    'request:send': async () => new Promise<never>(() => undefined),
    'request:cancel': async () => undefined,
    ...noopExtras()
  } as never)

describe('ui.navigatorView and showPanel', () => {
  it('defaults to collections', () => {
    expect(make().getState().ui.navigatorView).toBe('collections')
  })

  it('showPanel sets the view and expands a collapsed navigator', () => {
    const store = make()
    store.getState().toggleNavigator()
    expect(store.getState().navigatorCollapsed).toBe(true)
    store.getState().showPanel('environments')
    expect(store.getState().ui.navigatorView).toBe('environments')
    expect(store.getState().navigatorCollapsed).toBe(false)
  })

  it('showPanel leaves an expanded navigator expanded and can switch back', () => {
    const store = make()
    store.getState().showPanel('environments')
    expect(store.getState().navigatorCollapsed).toBe(false)
    store.getState().showPanel('collections')
    expect(store.getState().ui.navigatorView).toBe('collections')
    expect(store.getState().navigatorCollapsed).toBe(false)
  })
})
