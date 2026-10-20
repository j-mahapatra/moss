/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { newCollection, toItem } from '../../../shared/collection-tree'
import { newRequestSpec } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore, type RequestRef } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { Workbench } from '../shell/Workbench'

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
})

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

async function setup(names = ['Alpha', 'Beta', 'Gamma']) {
  stubMatchMedia()
  const col = newCollection('API')
  const specs = names.map((name) => ({ ...newRequestSpec(), name, url: `http://api/${name}` }))
  col.items.push(...specs.map(toItem))
  const refs = specs.map((s) => ({ collectionId: col.id, requestId: s.id }))
  const [a, b, c] = refs as [RequestRef, RequestRef, RequestRef]
  const api = {
    'request:send': vi.fn(() => new Promise<never>(() => {})),
    'request:cancel': vi.fn(async () => undefined),
    ...noopExtras(),
    'collections:list': vi.fn(async () => ({ collections: [col], warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  await store.getState().init()
  render(
    <WorkspaceProvider store={store}>
      <Workbench />
    </WorkspaceProvider>
  )
  const urlEditor = document.querySelector<HTMLElement>('[data-url-input]') as HTMLElement
  return { store, col, a, b, c, refs, urlEditor }
}

const switcher = () => screen.queryByRole('dialog', { name: 'Recent requests' })
const pressCtrlTab = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: 'Tab',
    ctrlKey: true,
    ...init
  })
const releaseCtrl = () =>
  fireEvent.keyUp(document.activeElement ?? document.body, { key: 'Control' })
const selectedName = () =>
  within(switcher() as HTMLElement)
    .getAllByRole('option')
    .find((o) => o.getAttribute('aria-selected') === 'true')
    ?.getAttribute('data-name')

describe('RecentsSwitcher', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Ctrl+Tab lists recents current first, lands on the previous one, and releasing Ctrl opens it', async () => {
    const { store, a, b, urlEditor } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
    })
    act(() => urlEditor.focus())
    pressCtrlTab()
    const dialog = switcher()
    expect(dialog).not.toBeNull()
    const options = within(dialog as HTMLElement).getAllByRole('option')
    expect(options.map((o) => o.getAttribute('data-name'))).toEqual(['Alpha', 'Beta'])
    expect(options[0]).toHaveTextContent('GET')
    expect(options[0]).toHaveTextContent('API')
    expect(selectedName()).toBe('Beta')
    releaseCtrl()
    expect(switcher()).toBeNull()
    expect(store.getState().active).toEqual(b)
    await waitFor(() => expect(document.activeElement).toBe(urlEditor))
  })

  it('Tab with Ctrl held moves down and Shift+Tab moves up, both wrapping', async () => {
    const { store, a, b, c } = await setup()
    act(() => {
      for (const ref of [c, b, a]) store.getState().openRequest(ref)
    })
    pressCtrlTab()
    expect(selectedName()).toBe('Beta')
    pressCtrlTab({ repeat: true })
    expect(selectedName()).toBe('Gamma')
    pressCtrlTab()
    expect(selectedName()).toBe('Alpha')
    pressCtrlTab({ shiftKey: true })
    expect(selectedName()).toBe('Gamma')
    releaseCtrl()
    expect(store.getState().active).toEqual(c)
  })

  it('Esc closes without opening anything', async () => {
    const { store, a, b, urlEditor } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
    })
    act(() => urlEditor.focus())
    pressCtrlTab()
    await userEvent.setup().keyboard('{Escape}')
    expect(switcher()).toBeNull()
    releaseCtrl()
    expect(store.getState().active).toEqual(a)
    expect(document.activeElement).toBe(urlEditor)
  })

  it('losing window focus closes without opening anything', async () => {
    const { store, a, b } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
    })
    pressCtrlTab()
    expect(switcher()).not.toBeNull()
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(switcher()).toBeNull()
    releaseCtrl()
    expect(store.getState().active).toEqual(a)
    expect(store.getState().ui.confirmDiscard).toBeNull()
  })

  it('Esc during an IME composition leaves the switcher open', async () => {
    const { store, a, b } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
    })
    pressCtrlTab()
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape', isComposing: true })
    expect(switcher()).not.toBeNull()
  })

  it('keeps the same request selected when a row above it vanishes', async () => {
    const { store, col, a, b, c } = await setup()
    act(() => {
      for (const ref of [c, b, a]) store.getState().openRequest(ref)
    })
    pressCtrlTab()
    expect(selectedName()).toBe('Beta')
    await act(async () => {
      await store.getState().updateCollection(col.id, (x) => ({
        ...x,
        items: x.items.filter((i) => i.id !== a.requestId)
      }))
    })
    await waitFor(() =>
      expect(
        within(switcher() as HTMLElement)
          .getAllByRole('option')
          .map((o) => o.getAttribute('data-name'))
      ).toEqual(['Beta', 'Gamma'])
    )
    expect(selectedName()).toBe('Beta')
  })

  it('re-anchors on the row that takes the place of a vanished selection', async () => {
    const { store, col, refs } = await setup(['Alpha', 'Beta', 'Gamma', 'Delta'])
    const [a, b, c, d] = refs as [RequestRef, RequestRef, RequestRef, RequestRef]
    act(() => {
      for (const ref of [d, c, b, a]) store.getState().openRequest(ref)
    })
    pressCtrlTab()
    expect(selectedName()).toBe('Beta')
    const drop = async (ref: RequestRef): Promise<void> => {
      await act(async () => {
        await store.getState().updateCollection(col.id, (x) => ({
          ...x,
          items: x.items.filter((i) => i.id !== ref.requestId)
        }))
      })
    }
    await drop(b)
    await waitFor(() => expect(selectedName()).toBe('Gamma'))
    // Gamma is now the selection, so a row vanishing above it doesn't move it.
    await drop(a)
    await waitFor(() =>
      expect(
        within(switcher() as HTMLElement)
          .getAllByRole('option')
          .map((o) => o.getAttribute('data-name'))
      ).toEqual(['Gamma', 'Delta'])
    )
    expect(selectedName()).toBe('Gamma')
  })

  it('Enter and clicking a row open it', async () => {
    const { store, a, b, c } = await setup()
    act(() => {
      for (const ref of [c, b, a]) store.getState().openRequest(ref)
    })
    pressCtrlTab()
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' })
    expect(switcher()).toBeNull()
    expect(store.getState().active).toEqual(b)

    pressCtrlTab()
    await userEvent.setup().click(within(switcher() as HTMLElement).getByText('Gamma'))
    expect(switcher()).toBeNull()
    expect(store.getState().active).toEqual(c)
  })

  it('an edited draft goes through the discard confirmation', async () => {
    const { store, a, b } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
      store.getState().updateDraft({ url: 'http://edited' })
    })
    // A stashed edit is kept, so leaving needs no confirmation; an unsaved new draft does.
    act(() => {
      store.getState().newRequest()
      store.getState().updateDraft({ url: 'http://new' })
    })
    pressCtrlTab()
    // No request is current, so the most recent one is selected first.
    expect(selectedName()).toBe('Alpha')
    releaseCtrl()
    expect(switcher()).toBeNull()
    expect(store.getState().active).toBeNull()
    expect(store.getState().ui.confirmDiscard).toEqual({ then: 'open', ref: a })
    const discard = screen.getByRole('dialog', { name: 'Discard unsaved request?' })
    await waitFor(() => expect(discard).toContainElement(document.activeElement as HTMLElement))
  })

  it('does nothing with no recents', async () => {
    const { store } = await setup()
    pressCtrlTab()
    expect(switcher()).toBeNull()
    expect(store.getState().ui.recentsOpen).toBe(false)
  })

  it('with only the current request it opens, and releasing Ctrl changes nothing', async () => {
    const { store, a } = await setup()
    act(() => {
      store.getState().openRequest(a)
      store.getState().updateDraft({ url: 'http://edited' })
    })
    pressCtrlTab()
    expect(selectedName()).toBe('Alpha')
    releaseCtrl()
    expect(switcher()).toBeNull()
    expect(store.getState().active).toEqual(a)
    expect(store.getState().draft.url).toBe('http://edited')
    expect(store.getState().ui.confirmDiscard).toBeNull()
  })

  it('ignores a held key for the opening press and does not open over another dialog', async () => {
    const { store, a, b } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
    })
    pressCtrlTab({ repeat: true })
    expect(switcher()).toBeNull()
    act(() => store.getState().openSaveDialog(true))
    pressCtrlTab()
    expect(switcher()).toBeNull()
  })

  it('keeps the global shortcuts inert while open', async () => {
    const { store, a, b } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
      store.getState().updateDraft({ url: 'http://edited' })
    })
    pressCtrlTab()
    const target = document.activeElement as Element
    expect(switcher()).toContainElement(target as HTMLElement)
    fireEvent.keyDown(target, { key: 'n', ctrlKey: true })
    fireEvent.keyDown(target, { key: 'b', ctrlKey: true })
    fireEvent.keyDown(target, { key: 'k', ctrlKey: true })
    expect(store.getState().ui.confirmDiscard).toBeNull()
    expect(store.getState().navigatorCollapsed).toBe(false)
    expect(store.getState().ui.paletteOpen).toBe(false)
    expect(switcher()).not.toBeNull()
  })

  it('a Select popup blocks Ctrl+K and Ctrl+Tab', async () => {
    const { store, a, b } = await setup()
    act(() => {
      store.getState().openRequest(b)
      store.getState().openRequest(a)
    })
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Method' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement as Element, { key: 'k', ctrlKey: true })
    expect(store.getState().ui.paletteOpen).toBe(false)
    pressCtrlTab()
    expect(switcher()).toBeNull()
  })
})
