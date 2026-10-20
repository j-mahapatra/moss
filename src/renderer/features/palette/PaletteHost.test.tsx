/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newCollection, toItem } from '../../../shared/collection-tree'
import { newRequestSpec } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { applyTheme } from '../../ui/theme'
import { Workbench } from '../shell/Workbench'

function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(min-width: 1100px)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }))
  )
}

async function setup() {
  stubMatchMedia()
  const col = newCollection('API')
  const getUser = { ...newRequestSpec(), name: 'Get user', url: 'http://api/user' }
  const health = { ...newRequestSpec(), name: 'Health', url: 'http://api/health' }
  col.items.push(toItem(getUser), toItem(health))
  const api = {
    'request:send': vi.fn(() => new Promise<never>(() => {})),
    'request:cancel': vi.fn(async () => undefined),
    ...noopExtras(),
    'collections:list': vi.fn(async () => ({ collections: [col], warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  await store.getState().init()
  const { unmount } = render(
    <WorkspaceProvider store={store}>
      <Workbench />
    </WorkspaceProvider>
  )
  const urlEditor = document.querySelector<HTMLElement>('[data-url-input]') as HTMLElement
  return { store, col, getUser, urlEditor, unmount }
}

const palette = () => screen.queryByRole('dialog', { name: 'Command palette' })
/** Ctrl+K: jsdom reports no platform, so the off-macOS binding applies. */
const pressK = (target: Element, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key: 'k', ctrlKey: true, ...init })

describe('PaletteHost', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens with Ctrl+K from the URL editor; Esc closes it and focus returns there', async () => {
    const { store, urlEditor } = await setup()
    act(() => urlEditor.focus())
    expect(document.activeElement).toBe(urlEditor)
    pressK(urlEditor)
    const dialog = palette()
    expect(dialog).not.toBeNull()
    expect(store.getState().ui.paletteOpen).toBe(true)
    const input = within(dialog as HTMLElement).getByRole('combobox')
    expect(input).toHaveAttribute('placeholder', 'Search requests, collections, commands…')
    expect(document.activeElement).toBe(input)
    await userEvent.setup().keyboard('{Escape}')
    expect(palette()).toBeNull()
    expect(store.getState().ui.paletteOpen).toBe(false)
    expect(document.activeElement).toBe(urlEditor)
  })

  it('pressing the shortcut again closes it; a held key does not reopen it', async () => {
    const { urlEditor } = await setup()
    act(() => urlEditor.focus())
    pressK(urlEditor)
    expect(palette()).not.toBeNull()
    pressK(document.activeElement as Element)
    expect(palette()).toBeNull()
    // Radix hands focus back on a timer after the dialog unmounts.
    await waitFor(() => expect(document.activeElement).toBe(urlEditor))
    pressK(urlEditor, { repeat: true })
    expect(palette()).toBeNull()
  })

  it('uses Cmd+K on macOS and leaves Ctrl+K to the editor there', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { urlEditor } = await setup()
    pressK(urlEditor)
    expect(palette()).toBeNull()
    fireEvent.keyDown(urlEditor, { key: 'k', metaKey: true })
    expect(palette()).not.toBeNull()
  })

  it('the top-bar search field shows ⌘K on macOS', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    await setup()
    const field = within(screen.getByRole('banner')).getByRole('button', {
      name: 'Open command palette (⌘K)'
    })
    expect(field).toHaveTextContent('⌘K')
  })

  it('Esc during an IME composition leaves the palette open', async () => {
    const { urlEditor } = await setup()
    act(() => urlEditor.focus())
    pressK(urlEditor)
    const input = within(palette() as HTMLElement).getByRole('combobox')
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(palette()).not.toBeNull()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(palette()).toBeNull()
  })

  it('typing a request name and pressing Enter opens that request', async () => {
    const { store, col, getUser, urlEditor } = await setup()
    act(() => urlEditor.focus())
    pressK(urlEditor)
    await userEvent.setup().keyboard('user{Enter}')
    expect(palette()).toBeNull()
    expect(store.getState().active).toEqual({ collectionId: col.id, requestId: getUser.id })
    expect(store.getState().draft.name).toBe('Get user')
  })

  it('leaves focus in the discard dialog an edited draft raises when opening a request', async () => {
    const { store, col, urlEditor } = await setup()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    act(() => urlEditor.focus())
    pressK(urlEditor)
    await userEvent.setup().keyboard('Health{Enter}')
    expect(palette()).toBeNull()
    expect(store.getState().ui.confirmDiscard).toMatchObject({
      then: 'open',
      ref: { collectionId: col.id }
    })
    const discard = screen.getByRole('dialog', { name: 'Discard unsaved request?' })
    await waitFor(() => expect(discard).toContainElement(document.activeElement as HTMLElement))
  })

  it('choosing a theme updates <html data-theme> and focus goes back', async () => {
    const { store, urlEditor } = await setup()
    const theme = applyTheme(() => store.getState().theme)
    const unsubscribe = store.subscribe(() => theme.refresh())
    try {
      expect(document.documentElement.dataset.theme).toBe('light')
      act(() => urlEditor.focus())
      pressK(urlEditor)
      await userEvent.setup().keyboard('Theme: Dark{Enter}')
      expect(store.getState().theme).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(document.activeElement).toBe(urlEditor)
    } finally {
      unsubscribe()
      theme.dispose()
      localStorage.clear()
      delete document.documentElement.dataset.theme
    }
  })

  it('leaves focus where an action put it outside any focus trap', async () => {
    const { store, urlEditor } = await setup()
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.append(outside)
    try {
      // The palette's trap holds focus until it unmounts, so the action focuses on the next task,
      // which still runs before Radix hands focus back.
      act(() => store.setState({ setTheme: () => void setTimeout(() => outside.focus(), 0) }))
      act(() => urlEditor.focus())
      pressK(urlEditor)
      await userEvent.setup().keyboard('Theme: Dark{Enter}')
      expect(palette()).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(outside))
      expect(document.activeElement).not.toBe(urlEditor)
    } finally {
      outside.remove()
    }
  })

  it('removes its capture-phase key listener on unmount', async () => {
    const { store, unmount } = await setup()
    const remove = vi.spyOn(document, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    pressK(document.body)
    expect(store.getState().ui.paletteOpen).toBe(false)
  })

  it('the top-bar search field opens the palette and gets focus back on Esc', async () => {
    await setup()
    const user = userEvent.setup()
    const field = within(screen.getByRole('banner')).getByRole('button', {
      name: 'Open command palette (Ctrl+K)'
    })
    expect(field).toHaveTextContent('Search requests, collections, commands…')
    expect(field).toHaveTextContent('Ctrl+K')
    await user.click(field)
    expect(palette()).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(palette()).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('does nothing while the Save dialog is open', async () => {
    const { store } = await setup()
    act(() => store.getState().openSaveDialog(true))
    expect(screen.getByRole('dialog', { name: /save/i })).toBeInTheDocument()
    pressK(document.activeElement as Element)
    expect(store.getState().ui.paletteOpen).toBe(false)
    expect(palette()).toBeNull()
  })

  it('does nothing while a menu is open', async () => {
    const { store, urlEditor } = await setup()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    try {
      pressK(urlEditor)
      expect(store.getState().ui.paletteOpen).toBe(false)
    } finally {
      menu.remove()
    }
  })

  it('keeps the other shortcuts inert while open', async () => {
    const { store, urlEditor } = await setup()
    act(() => urlEditor.focus())
    pressK(urlEditor)
    const input = within(palette() as HTMLElement).getByRole('combobox')
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    fireEvent.keyDown(input, { key: 'n', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'b', ctrlKey: true })
    expect(store.getState().ui.confirmDiscard).toBeNull()
    expect(store.getState().navigatorCollapsed).toBe(false)
    expect(document.activeElement).toBe(input)
  })
})
