import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceStore, type WorkspaceState } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { useWorkspace } from '../../state/workspace-hooks'
import { Workbench } from './Workbench'

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
    'request:cancel': vi.fn(async () => undefined)
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
