/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newRequestSpec, type HistoryEntry } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { DiscardDialog } from '../shell/DiscardDialog'
import { SaveDialog } from '../collections/SaveDialog'
import { HistoryPanel } from './HistoryPanel'

const NOW = new Date(2026, 9, 19, 12, 0, 0)
const at = (daysAgo: number): string => new Date(2026, 9, 19 - daysAgo, 9, 30, 0).toISOString()

function entry(
  id: string,
  url: string,
  extra: Partial<HistoryEntry> = {},
  daysAgo = 0
): HistoryEntry {
  return {
    id,
    at: at(daysAgo),
    request: { ...newRequestSpec(), url, name: id },
    status: 200,
    durationMs: 42,
    ...extra
  }
}

const sample = (): HistoryEntry[] => [
  entry('a', 'http://a.test/one'),
  entry('b', 'http://b.test/two', { status: null, errorKind: 'aborted' }),
  entry('c', 'http://c.test/three', { status: null, errorKind: 'network' as never }, 1),
  entry('d', '', {}, 1)
]

async function setup(entries: HistoryEntry[] = sample()) {
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(),
    ...noopExtras(),
    'history:list': vi.fn(async () => ({ entries, warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  render(
    <WorkspaceProvider store={store}>
      <HistoryPanel />
      <DiscardDialog />
      <SaveDialog />
    </WorkspaceProvider>
  )
  await act(async () => {
    await store.getState().init()
  })
  return { api, store, user: userEvent.setup() }
}

const rows = () => screen.getAllByRole('listitem')
const row = (i: number) => rows()[i] as HTMLElement

describe('HistoryPanel midnight and loading', () => {
  afterEach(() => vi.useRealTimers())

  it('re-renders at the next local midnight so Today becomes Yesterday, and clears the timer on unmount', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 19, 23, 59, 0))
    const e = entry('a', 'http://a.test/one')
    const store = createWorkspaceStore({
      'request:send': vi.fn(),
      'request:cancel': vi.fn(),
      ...noopExtras(),
      'history:list': vi.fn(async () => ({ entries: [e], warnings: [] }))
    } as never)
    const view = render(
      <WorkspaceProvider store={store}>
        <HistoryPanel />
      </WorkspaceProvider>
    )
    await act(async () => {
      await store.getState().init()
    })
    expect(screen.getByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    expect(screen.getByRole('heading', { level: 3, name: 'Yesterday' })).toBeInTheDocument()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows Loading… before history has loaded', () => {
    const store = createWorkspaceStore({
      'request:send': vi.fn(),
      'request:cancel': vi.fn(),
      ...noopExtras()
    } as never)
    render(
      <WorkspaceProvider store={store}>
        <HistoryPanel />
      </WorkspaceProvider>
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})

describe('HistoryPanel', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())
  beforeEach(() => vi.setSystemTime(NOW))

  it('groups by day and shows status, time and duration per row', async () => {
    await setup()
    expect(screen.getByRole('complementary', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(within(row(0)).getByText('200')).toBeInTheDocument()
    expect(within(row(1)).getByText('Cancelled')).toBeInTheDocument()
    expect(within(row(2)).getByText('Error')).toBeInTheDocument()
    expect(within(row(0)).getByText('42 ms')).toBeInTheDocument()
    expect(within(row(0)).getByText('GET')).toBeInTheDocument()
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(at(0))
    )
    expect(within(row(0)).getByText(time)).toBeInTheDocument()
    expect(within(row(0)).getByText('http://a.test/one')).toHaveAttribute(
      'title',
      'http://a.test/one'
    )
    expect(within(row(3)).getByText('(no URL)')).toBeInTheDocument()
  })

  it('shows the empty state and disables Clear with no history', async () => {
    await setup([])
    expect(screen.getByText('No requests yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeDisabled()
  })

  it('filters and shows No matches', async () => {
    const { user } = await setup()
    const filter = screen.getByRole('textbox', { name: 'Filter history' })
    await user.type(filter, 'b.test')
    expect(rows()).toHaveLength(1)
    await user.clear(filter)
    await user.type(filter, 'zzz')
    expect(screen.getByText('No matches')).toBeInTheDocument()
    expect(screen.queryByText('No requests yet')).toBeNull()
  })

  it('Enter opens the entry into the draft', async () => {
    const { store } = await setup()
    act(() => row(0).focus())
    fireEvent.keyDown(row(0), { key: 'Enter' })
    expect(store.getState().draft.url).toBe('http://a.test/one')
  })

  it('clicking a row opens it', async () => {
    const { store, user } = await setup()
    await user.click(row(1))
    expect(store.getState().draft.url).toBe('http://b.test/two')
  })

  it('confirms before replacing an edited draft; Discard then opens', async () => {
    const { store, user } = await setup()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    await user.click(row(0))
    expect(await screen.findByText('Discard unsaved request?')).toBeInTheDocument()
    expect(store.getState().ui.confirmDiscard).toEqual({ then: 'history', id: 'a' })
    expect(store.getState().draft.url).toBe('http://edited')
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(store.getState().draft.url).toBe('http://a.test/one')
  })

  it('menu lists Open, Save to collection…, Delete', async () => {
    const { user } = await setup()
    await user.click(within(row(0)).getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Open',
      'Save to collection…',
      'Delete'
    ])
  })

  it('Save to collection… opens the entry and the Save dialog', async () => {
    const { store, user } = await setup()
    await user.click(within(row(0)).getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Save to collection…' }))
    await waitFor(() => expect(store.getState().ui.saveDialogOpen).toBe(true))
    expect(store.getState().draft.url).toBe('http://a.test/one')
  })

  it('Save to collection… with a blocked open asks to discard and does not open Save', async () => {
    const { store, user } = await setup()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    await user.click(within(row(0)).getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Save to collection…' }))
    expect(await screen.findByText('Discard unsaved request?')).toBeInTheDocument()
    expect(store.getState().ui.saveDialogOpen).toBe(false)
  })

  it('menu Delete removes the row immediately and focuses the next row', async () => {
    const { api, user } = await setup()
    await user.click(within(row(0)).getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(api['history:delete']).toHaveBeenCalledWith({ id: 'a' })
    await waitFor(() => expect(row(0)).toHaveFocus())
  })

  it('deleting the last row focuses the previous one; the only row focuses the filter', async () => {
    const { user } = await setup([entry('x', 'http://x'), entry('y', 'http://y')])
    act(() => row(1).focus())
    fireEvent.keyDown(row(1), { key: 'Delete' })
    await waitFor(() => expect(rows()).toHaveLength(1))
    await waitFor(() => expect(row(0)).toHaveFocus())
    fireEvent.keyDown(row(0), { key: 'Backspace' })
    await waitFor(() => expect(screen.getByText('No requests yet')).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Filter history' })).toHaveFocus()
    void user
  })

  it('ContextMenu, Shift+F10 and right-click open the menu', async () => {
    await setup()
    fireEvent.keyDown(row(0), { key: 'ContextMenu' })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    fireEvent.keyDown(row(1), { key: 'F10', shiftKey: true })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    fireEvent.contextMenu(row(2))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('ignores modified keys and keys from inner controls', async () => {
    const { store, api } = await setup()
    fireEvent.keyDown(row(0), { key: 'Enter', metaKey: true })
    fireEvent.keyDown(row(0), { key: 'Delete', ctrlKey: true })
    fireEvent.keyDown(within(row(0)).getByRole('button', { name: 'More actions' }), {
      key: 'Delete'
    })
    expect(api['history:delete']).not.toHaveBeenCalled()
    expect(store.getState().draft.url).toBe('')
  })

  it('Clear history confirms, then clears and shows the empty state', async () => {
    const { api, user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Clear history' }))
    expect(await screen.findByText('Clear history?')).toBeInTheDocument()
    expect(screen.getByText("This removes every entry. It can't be undone.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api['history:clear']).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear history' }))
    await user.click(await screen.findByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.getByText('No requests yet')).toBeInTheDocument())
    expect(api['history:clear']).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Clear history?')).toBeNull())
    expect(screen.getByRole('textbox', { name: 'Filter history' })).toHaveFocus()
  })

  it('ignores auto-repeated Delete and Enter, but not the first press', async () => {
    const { api, store } = await setup([entry('x', 'http://x'), entry('y', 'http://y')])
    act(() => row(0).focus())
    fireEvent.keyDown(row(0), { key: 'Delete', repeat: true })
    fireEvent.keyDown(row(0), { key: 'Backspace', repeat: true })
    expect(api['history:delete']).not.toHaveBeenCalled()
    fireEvent.keyDown(row(0), { key: 'Enter', repeat: true })
    expect(store.getState().draft.url).toBe('')
    fireEvent.keyDown(row(0), { key: 'Enter' })
    expect(store.getState().draft.url).toBe('http://x')
    fireEvent.keyDown(row(0), { key: 'Delete' })
    await waitFor(() => expect(api['history:delete']).toHaveBeenCalledTimes(1))
  })

  it('keeps the dialog open when clearing fails', async () => {
    const { api, user } = await setup()
    vi.mocked(api['history:clear']).mockRejectedValueOnce(new Error('disk'))
    await user.click(screen.getByRole('button', { name: 'Clear history' }))
    await user.click(await screen.findByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(api['history:clear']).toHaveBeenCalled())
    expect(screen.getByText('Clear history?')).toBeInTheDocument()
  })
})
