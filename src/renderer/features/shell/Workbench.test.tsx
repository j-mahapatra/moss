import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newCollection, toItem } from '../../../shared/collection-tree'
import { newRequestSpec, type Collection } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore, type WorkspaceState } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { useWorkspace } from '../../state/workspace-hooks'
import { Popover } from '../../ui'
import { Workbench } from './Workbench'
import { setDoc, viewOf } from '../requests/test-utils'

function stubMatchMedia(matches: boolean): (m: boolean) => void {
  const listeners = new Set<(e: Event) => void>()
  let current = matches
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return current
      },
      media: query,
      addEventListener: (_: string, l: (e: Event) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (e: Event) => void) => listeners.delete(l)
    }))
  )
  return (m: boolean) => {
    current = m
    listeners.forEach((l) => l(new Event('change')))
  }
}

function setup(matches = true): {
  api: { 'request:send': ReturnType<typeof vi.fn>; 'request:cancel': ReturnType<typeof vi.fn> }
  store: ReturnType<typeof createWorkspaceStore>
  setMatch: (m: boolean) => void
} {
  const setMatch = stubMatchMedia(matches)
  const api = {
    'request:send': vi.fn(() => new Promise<never>(() => {})),
    'request:cancel': vi.fn(async () => undefined),
    ...noopExtras()
  }
  const store = createWorkspaceStore(api as never)
  render(
    <WorkspaceProvider store={store}>
      <Workbench />
    </WorkspaceProvider>
  )
  return { api, store, setMatch }
}

describe('Workbench', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('renders the header, request and response panes', () => {
    setup()
    expect(screen.getByRole('banner')).toHaveTextContent('Moss')
    expect(screen.getByRole('region', { name: 'Request' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Response' })).toBeInTheDocument()
  })

  it('stacks panes below 1100px and goes side by side above, reacting to changes', () => {
    const { setMatch } = setup(false)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
    act(() => setMatch(true))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('queries the 1100px breakpoint', () => {
    setup(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1100px)')
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  })

  it.each(['metaKey', 'ctrlKey'] as const)('%s+Enter sends', (mod) => {
    const { api } = setup()
    fireEvent.keyDown(window, { key: 'Enter', [mod]: true })
    expect(api['request:send']).toHaveBeenCalledTimes(1)
  })

  it('plain Enter does nothing', () => {
    const { api } = setup()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(api['request:send']).not.toHaveBeenCalled()
  })

  it('Escape cancels only when a request is in flight', () => {
    const { api } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(api['request:cancel']).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(api['request:cancel']).toHaveBeenCalledTimes(1)
  })

  it('Escape and Cmd+Enter do nothing while a dialog is open', () => {
    const { api } = setup()
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(api['request:send']).toHaveBeenCalledTimes(1)
    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'dialog')
    document.body.append(dlg)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    dlg.remove()
    expect(api['request:cancel']).not.toHaveBeenCalled()
    expect(api['request:send']).toHaveBeenCalledTimes(1)
  })

  it('Cmd+N does nothing while a menu is open', () => {
    const { store } = setup()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    menu.remove()
    expect(store.getState().ui.confirmDiscard).toBeNull()
  })

  it('Cmd/Ctrl+L focuses the URL input and prevents default', () => {
    setup()
    // The real URL editor: the CodeMirror contenteditable carries data-url-input (R4).
    const input = document.querySelector<HTMLElement>('[data-url-input]') as HTMLElement
    expect(input).toHaveClass('cm-content')
    const ev = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, cancelable: true })
    window.dispatchEvent(ev)
    expect(document.activeElement).toBe(input)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('removes the keydown listener on unmount', () => {
    const { api } = setup()
    cleanupAndFire(api)
  })
})

function cleanupAndFire(api: { 'request:send': ReturnType<typeof vi.fn> }): void {
  // Verify one mount adds exactly one keydown listener and unmount removes that same one.
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const store = createWorkspaceStore(api as never)
  const r = render(
    <WorkspaceProvider store={store}>
      <Workbench />
    </WorkspaceProvider>
  )
  r.unmount()
  const added = add.mock.calls.filter((c) => c[0] === 'keydown')
  const removed = remove.mock.calls.filter((c) => c[0] === 'keydown')
  expect(added).toHaveLength(1)
  expect(removed).toHaveLength(1)
  expect(removed[0]?.[1]).toBe(added[0]?.[1])
}

describe('send shortcut', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('Mod-Enter inside the body editor sends the body unchanged', async () => {
    stubMatchMedia(true)
    const api = {
      'request:send': vi.fn(() => new Promise<never>(() => {})),
      'request:cancel': vi.fn(async () => undefined),
      ...noopExtras()
    }
    const store = createWorkspaceStore(api as never)
    store.getState().updateDraft({ body: { mode: 'raw', contentType: 'text/plain', text: 'abc' } })
    const { container } = render(
      <WorkspaceProvider store={store}>
        <Workbench />
      </WorkspaceProvider>
    )
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Body' }))
    const view = viewOf(container, 'Body')
    expect(view.state.doc.toString()).toBe('abc')
    setDoc(view, 'abc')
    view.focus()
    act(() => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })
    expect(api['request:send']).toHaveBeenCalledTimes(1)
    const sent = api['request:send'].mock.calls[0] as unknown as [
      { request: { body: { text: string } } }
    ]
    expect(sent[0].request.body.text).toBe('abc')
    expect(store.getState().draft.body).toMatchObject({ mode: 'raw', text: 'abc' })
    expect(view.state.doc.toString()).toBe('abc')
  })

  it('ignores auto-repeated keydowns', () => {
    const { api } = setup()
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, repeat: true })
    expect(api['request:send']).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(api['request:send']).toHaveBeenCalledTimes(1)
  })
})

describe('useWorkspace', () => {
  it('throws a clear error outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const swallow = (e: ErrorEvent): void => e.preventDefault()
    window.addEventListener('error', swallow)
    function Probe(): null {
      useWorkspace((s: WorkspaceState) => s.split)
      return null
    }
    expect(() => render(<Probe />)).toThrow(/WorkspaceProvider/)
    window.removeEventListener('error', swallow)
    spy.mockRestore()
  })
})

/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helper */
describe('shell', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  function shell(cols: Collection[] = []) {
    stubMatchMedia(true)
    const api = {
      'request:send': vi.fn(() => new Promise<never>(() => {})),
      'request:cancel': vi.fn(async () => undefined),
      ...noopExtras(),
      'collections:list': vi.fn(async () => ({ collections: cols, warnings: [] })),
      'collections:save': vi.fn(async () => undefined)
    }
    const store = createWorkspaceStore(api as never)
    render(
      <WorkspaceProvider store={store}>
        <Workbench />
      </WorkspaceProvider>
    )
    return { api, store }
  }

  it('toggles the navigator from the rail button and Cmd+B', async () => {
    const { store } = shell()
    const rail = screen.getByRole('navigation', { name: 'Sidebar' })
    const btn = within(rail).getByRole('button', { name: 'Collections' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('complementary', { name: 'Collections' })).toBeInTheDocument()
    await userEvent.setup().click(btn)
    expect(store.getState().navigatorCollapsed).toBe(true)
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('complementary', { name: 'Collections' })).toBeNull()
    const ev = new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true })
    act(() => {
      window.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(store.getState().navigatorCollapsed).toBe(false)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, repeat: true }))
    })
    expect(store.getState().navigatorCollapsed).toBe(false)
  })

  it('switches panels from the rail and toggles collapse on the current view', async () => {
    const { store } = shell()
    const user = userEvent.setup()
    const rail = screen.getByRole('navigation', { name: 'Sidebar' })
    const cols = within(rail).getByRole('button', { name: 'Collections' })
    const envs = within(rail).getByRole('button', { name: 'Environments' })
    expect(cols).toHaveAttribute('aria-pressed', 'true')
    expect(envs).toHaveAttribute('aria-pressed', 'false')

    await user.click(envs)
    expect(screen.getByRole('complementary', { name: 'Environments' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Collections' })).toBeNull()
    expect(cols).toHaveAttribute('aria-pressed', 'false')
    expect(envs).toHaveAttribute('aria-pressed', 'true')

    await user.click(envs)
    expect(store.getState().navigatorCollapsed).toBe(true)
    expect(envs).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('complementary', { name: 'Environments' })).toBeNull()

    // Cmd+B only toggles collapse; the view is kept.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }))
    })
    expect(store.getState().ui.navigatorView).toBe('environments')
    expect(screen.getByRole('complementary', { name: 'Environments' })).toBeInTheDocument()

    // Collapsed, then the other item: switches view and expands.
    await user.click(envs)
    expect(store.getState().navigatorCollapsed).toBe(true)
    await user.click(cols)
    expect(store.getState().navigatorCollapsed).toBe(false)
    expect(screen.getByRole('complementary', { name: 'Collections' })).toBeInTheDocument()
    expect(cols).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows Loading until init finishes, then the empty state', async () => {
    const { store } = shell()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await act(async () => {
      await store.getState().init()
    })
    expect(await screen.findByText('No collections yet')).toBeInTheDocument()
  })

  it('renders notices and dismisses them', async () => {
    const { store } = shell()
    act(() => {
      store.setState({ notices: [{ id: 'n1', tone: 'danger', message: 'Boom' }] })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(store.getState().notices).toEqual([])
  })

  it('Cmd+S saves the active request; with none it opens the save dialog', async () => {
    const col = newCollection('C')
    const spec = { ...newRequestSpec(), name: 'r' }
    col.items.push(toItem(spec))
    const { store, api } = shell([col])
    await act(async () => {
      await store.getState().init()
    })
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    })
    expect(store.getState().ui.saveDialogOpen).toBe(true)
    expect(api['collections:save']).not.toHaveBeenCalled()
    act(() => store.getState().openSaveDialog(false))
    act(() => {
      store.getState().openRequest({ collectionId: col.id, requestId: spec.id })
      store.getState().updateDraft({ url: 'http://x' })
    })
    await act(async () => {
      fireEvent.keyDown(window, { key: 'S', metaKey: true })
    })
    expect(api['collections:save']).toHaveBeenCalledTimes(1)
    expect(store.getState().ui.saveDialogOpen).toBe(false)
  })

  it('ignores Cmd+S while a Popover is open', async () => {
    const col = newCollection('C')
    const spec = { ...newRequestSpec(), name: 'r' }
    col.items.push(toItem(spec))
    const { store, api } = shell([col])
    await act(async () => {
      await store.getState().init()
    })
    act(() => {
      store.getState().openRequest({ collectionId: col.id, requestId: spec.id })
      store.getState().updateDraft({ url: 'http://x' })
    })
    const saveActive = vi.spyOn(store.getState(), 'saveActive')
    const user = userEvent.setup()
    render(
      <Popover trigger={<button>Env</button>} aria-label="Environments">
        <p>Body</p>
      </Popover>
    )
    await user.click(screen.getByRole('button', { name: 'Env' }))
    expect(screen.getByRole('dialog', { name: 'Environments' })).toBeInTheDocument()
    const ev = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true })
    act(() => {
      window.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(api['collections:save']).not.toHaveBeenCalled()
    expect(saveActive).not.toHaveBeenCalled()
    expect(store.getState().ui.saveDialogOpen).toBe(false)
  })

  it('ignores s/n/b while a dialog is open', () => {
    const { store } = shell()
    act(() => store.getState().openSaveDialog(true))
    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'dialog')
    document.body.append(dlg)
    act(() => {
      fireEvent.keyDown(window, { key: 'b', metaKey: true })
    })
    expect(store.getState().navigatorCollapsed).toBe(false)
    dlg.remove()
  })

  it('Cmd+N on an edited draft confirms; Discard starts a fresh draft', async () => {
    const { store } = shell()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    act(() => {
      fireEvent.keyDown(window, { key: 'n', metaKey: true })
    })
    expect(await screen.findByText('Discard unsaved request?')).toBeInTheDocument()
    expect(store.getState().draft.url).toBe('http://edited')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard' }))
    expect(store.getState().draft.url).toBe('')
    expect(store.getState().ui.confirmDiscard).toBeNull()
    expect(screen.queryByText('Discard unsaved request?')).toBeNull()
  })

  it('Cancel keeps the draft', async () => {
    const { store } = shell()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    act(() => {
      fireEvent.keyDown(window, { key: 'n', metaKey: true })
    })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(store.getState().draft.url).toBe('http://edited')
    expect(store.getState().ui.confirmDiscard).toBeNull()
  })
})

describe('Workbench layout guard', () => {
  it('keeps the body in the 1fr row even when Notices renders nothing', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(`${__dirname}/Workbench.css`, 'utf8')
    expect(css).toMatch(/grid-template-rows:\s*auto auto minmax\(0, 1fr\);/)
    expect(css).toMatch(/\.workbench__body\s*\{[^}]*grid-row:\s*3;/)
  })
})
