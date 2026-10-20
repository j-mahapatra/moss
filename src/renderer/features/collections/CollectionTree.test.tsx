/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newCollection, newFolder, toItem } from '../../../shared/collection-tree'
import { newRequestSpec, type Collection } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { Navigator } from './Navigator'

const req = (name: string, method: 'GET' | 'POST' = 'GET') =>
  toItem({ ...newRequestSpec(), name, method })

function seed() {
  const inner = req('Inner')
  const folder = { ...newFolder('Docs'), items: [inner] }
  const top = req('Top', 'POST')
  const col: Collection = { ...newCollection('Alpha'), items: [folder, top] }
  return { col, folder, inner, top }
}

async function setup(cols: Collection[]) {
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(),
    ...noopExtras(),
    'collections:list': vi.fn(async () => ({ collections: cols, warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  render(
    <WorkspaceProvider store={store}>
      <Navigator />
    </WorkspaceProvider>
  )
  await act(async () => {
    await store.getState().init()
  })
  return { api, store, user: userEvent.setup() }
}

const row = (name: string) => screen.getByRole('treeitem', { name })
const names = () => screen.getAllByRole('treeitem').map((r) => r.getAttribute('aria-label'))
const menuItems = () => screen.getAllByRole('menuitem').map((m) => m.textContent)

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(row(name)).getByRole('button', { name: 'More actions' }))
}

describe('CollectionTree', () => {
  it('renders nested items with tree roles; folders start collapsed, collections expanded', async () => {
    const { col } = seed()
    const { user } = await setup([col])
    expect(screen.getByRole('tree', { name: 'Collections' })).toBeInTheDocument()
    expect(row('Alpha')).toHaveAttribute('aria-expanded', 'true')
    expect(row('Alpha')).toHaveAttribute('aria-level', '1')
    expect(row('Docs')).toHaveAttribute('aria-expanded', 'false')
    expect(row('Docs')).toHaveAttribute('aria-level', '2')
    expect(row('Top')).toHaveAttribute('aria-posinset', '2')
    expect(row('Top')).toHaveAttribute('aria-setsize', '2')
    expect(names()).toEqual(['Alpha', 'Docs', 'Top'])
    await user.click(row('Docs'))
    expect(row('Docs')).toHaveAttribute('aria-expanded', 'true')
    expect(row('Inner')).toHaveAttribute('aria-level', '3')
    expect(names()).toEqual(['Alpha', 'Docs', 'Inner', 'Top'])
    await user.click(row('Alpha'))
    expect(names()).toEqual(['Alpha'])
  })

  it('shows the method label and opens a request on click', async () => {
    const { col, top } = seed()
    const { user, store } = await setup([col])
    expect(within(row('Top')).getByText('POST')).toBeInTheDocument()
    await user.click(row('Top'))
    expect(row('Top')).toHaveAttribute('aria-selected', 'true')
    expect(store.getState().active).toEqual({ collectionId: col.id, requestId: top.id })
  })

  it('shows a dirty dot after the draft is edited', async () => {
    const { col } = seed()
    const { user, store } = await setup([col])
    await user.click(row('Top'))
    expect(screen.queryByRole('img', { name: 'Unsaved changes' })).toBeNull()
    act(() => store.getState().updateDraft({ url: 'https://x.test' }))
    expect(within(row('Top')).getByRole('img', { name: 'Unsaved changes' })).toBeInTheDocument()
  })

  it('asks before discarding when opening over a dirty draft', async () => {
    const { col } = seed()
    const { user, store } = await setup([col])
    act(() => store.getState().updateDraft({ url: 'https://x.test' })) // unsaved new request
    await user.click(row('Top'))
    expect(store.getState().active).toBeNull()
    expect(store.getState().ui.confirmDiscard).toMatchObject({ then: 'open' })
  })

  it('moves focus with arrows and expands/collapses with right/left', async () => {
    const { col } = seed()
    const { user } = await setup([col])
    expect(row('Alpha')).toHaveAttribute('tabindex', '0')
    expect(row('Docs')).toHaveAttribute('tabindex', '-1')
    row('Alpha').focus()
    await user.keyboard('{ArrowDown}')
    expect(row('Docs')).toHaveFocus()
    expect(row('Docs')).toHaveAttribute('tabindex', '0')
    expect(row('Alpha')).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{ArrowRight}')
    expect(row('Docs')).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowRight}')
    expect(row('Inner')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(row('Docs')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(row('Docs')).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{ArrowLeft}')
    expect(row('Alpha')).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')
    expect(row('Docs')).toHaveFocus()
  })

  it('Enter opens the focused request', async () => {
    const { col } = seed()
    const { user } = await setup([col])
    row('Top').focus()
    await user.keyboard('{Enter}')
    expect(row('Top')).toHaveAttribute('aria-selected', 'true')
  })

  it('menus list exactly the items for each kind', async () => {
    const { col } = seed()
    const { user } = await setup([col])
    await openMenu(user, 'Alpha')
    expect(screen.getByRole('menu', { name: 'Actions for Alpha' })).toBeInTheDocument()
    expect(menuItems()).toEqual([
      'New request',
      'New folder',
      'Variables…',
      'Export…',
      'Rename',
      'Delete'
    ])
    await user.keyboard('{Escape}')
    await openMenu(user, 'Docs')
    expect(menuItems()).toEqual(['New request', 'New folder', 'Rename', 'Duplicate', 'Delete'])
    await user.keyboard('{Escape}')
    await openMenu(user, 'Top')
    expect(menuItems()).toEqual(['Open', 'Rename', 'Duplicate', 'Delete'])
  })

  it('right-click opens the row menu', async () => {
    const { col } = seed()
    await setup([col])
    fireEvent.contextMenu(row('Top'))
    expect(screen.getByRole('menu', { name: 'Actions for Top' })).toBeInTheDocument()
  })

  it('Variables… opens the variables dialog state', async () => {
    const { col } = seed()
    const { user, store } = await setup([col])
    await openMenu(user, 'Alpha')
    await user.click(screen.getByRole('menuitem', { name: 'Variables…' }))
    expect(store.getState().ui.variablesFor).toBe(col.id)
  })

  it('Export… saves the collection file once the menu has closed', async () => {
    const { col } = seed()
    const { user, api } = await setup([col])
    let menuOpenAtCall: boolean | null = null
    vi.mocked(api['export:save-file']).mockImplementation(async () => {
      menuOpenAtCall = document.querySelector('[role="menu"]') !== null
      return true
    })
    await openMenu(user, 'Alpha')
    await user.click(screen.getByRole('menuitem', { name: 'Export…' }))
    await waitFor(() => expect(api['export:save-file']).toHaveBeenCalledTimes(1))
    expect(menuOpenAtCall).toBe(false)
    expect(api['export:save-file']).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: expect.stringMatching(/Alpha/) })
    )
  })

  it('New request saves an Untitled request and opens it', async () => {
    const { col } = seed()
    const { user, store, api } = await setup([col])
    await openMenu(user, 'Alpha')
    await user.click(screen.getByRole('menuitem', { name: 'New request' }))
    expect(api['collections:save']).toHaveBeenCalledTimes(1)
    expect(row('Untitled request')).toHaveAttribute('aria-selected', 'true')
    expect(store.getState().active?.collectionId).toBe(col.id)
  })

  it('New folder enters rename; typing and Enter saves the folder name', async () => {
    const { col } = seed()
    const { user, api, store } = await setup([col])
    await openMenu(user, 'Alpha')
    await user.click(screen.getByRole('menuitem', { name: 'New folder' }))
    const input = screen.getByRole('textbox', { name: 'Rename' })
    expect(input).toHaveFocus()
    await user.keyboard('Specs{Enter}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(row('Specs')).toBeInTheDocument()
    expect(api['collections:save']).toHaveBeenCalledTimes(2)
    expect(store.getState().collections[0]!.items.map((i) => i.name)).toContain('Specs')
  })

  it('new collection from the header enters rename (P1)', async () => {
    const { user, store } = await setup([])
    await user.click(screen.getByRole('button', { name: 'Create collection' }))
    const input = await screen.findByRole('textbox', { name: 'Rename' })
    expect(input).toHaveFocus()
    await user.keyboard('Mine{Enter}')
    expect(store.getState().collections[0]!.name).toBe('Mine')
    await user.click(screen.getByRole('button', { name: 'New collection' }))
    expect(await screen.findByRole('textbox', { name: 'Rename' })).toBeInTheDocument()
  })

  it('F2 then Esc leaves the name unchanged; blur cancels; empty keeps the old name', async () => {
    const { col } = seed()
    const { user, api } = await setup([col])
    row('Top').focus()
    await user.keyboard('{F2}')
    await user.keyboard('Changed{Escape}')
    expect(row('Top')).toBeInTheDocument()
    expect(row('Top')).toHaveFocus()
    await user.keyboard('{F2}')
    await user.keyboard('Changed')
    await user.click(document.body)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(row('Top')).toBeInTheDocument()
    await user.keyboard('{F2}')
    await user.keyboard('{Control>}a{/Control}{Backspace}{Enter}')
    expect(row('Top')).toBeInTheDocument()
    expect(api['collections:save']).not.toHaveBeenCalled()
  })

  it('renames a request and a collection with Enter', async () => {
    const { col } = seed()
    const { user, store } = await setup([col])
    row('Top').focus()
    await user.keyboard('{F2}{Control>}a{/Control}Renamed{Enter}')
    expect(row('Renamed')).toBeInTheDocument()
    row('Alpha').focus()
    await user.keyboard('{F2}{Control>}a{/Control}Zed{Enter}')
    expect(store.getState().collections[0]!.name).toBe('Zed')
  })

  it('duplicating a folder makes a sibling named "<name> copy"', async () => {
    const { col } = seed()
    const { user } = await setup([col])
    await openMenu(user, 'Docs')
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(names()).toEqual(['Alpha', 'Docs', 'Docs copy', 'Top'])
  })

  it('delete confirms with the exact copy and removes the item after save', async () => {
    const { col } = seed()
    const { user, api, store } = await setup([col])
    await openMenu(user, 'Docs')
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete “Docs”?' })
    expect(dialog).toHaveTextContent(
      "This can't be undone. Everything inside it will be deleted too."
    )
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(row('Docs')).toBeInTheDocument()
    row('Docs').focus()
    await user.keyboard('{Delete}')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('treeitem', { name: 'Docs' })).toBeNull()
    expect(api['collections:save']).toHaveBeenCalledTimes(1)
    expect(store.getState().collections[0]!.items).toHaveLength(1)
  })

  it('request delete wording has no "inside" sentence; Backspace works', async () => {
    const { col } = seed()
    const { user } = await setup([col])
    row('Top').focus()
    await user.keyboard('{Backspace}')
    const dialog = screen.getByRole('dialog', { name: 'Delete “Top”?' })
    expect(dialog).toHaveTextContent("This can't be undone.")
    expect(dialog).not.toHaveTextContent('Everything inside')
  })

  it('deleting the active request folder leaves the draft open, unsaved', async () => {
    const { col, inner } = seed()
    const { user, store } = await setup([col])
    await user.click(row('Docs'))
    await user.click(row('Inner'))
    expect(store.getState().active?.requestId).toBe(inner.id)
    act(() => store.getState().updateDraft({ url: 'https://keep.test' }))
    await openMenu(user, 'Docs')
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('treeitem', { name: 'Inner' })).toBeNull()
    expect(store.getState().active).toBeNull()
    expect(store.getState().draft.url).toBe('https://keep.test')
  })

  it('Delete key does nothing on a collection; its menu deletes it', async () => {
    const { col } = seed()
    const { user, api, store } = await setup([col])
    row('Alpha').focus()
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await openMenu(user, 'Alpha')
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete “Alpha”?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(api['collections:delete']).toHaveBeenCalledWith({ id: col.id })
    expect(store.getState().collections).toHaveLength(0)
  })

  it('re-clicking the active request keeps its response', async () => {
    const { col } = seed()
    const { user, store } = await setup([col])
    await user.click(row('Top'))
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = store.getState().send()
    })
    const r = { ok: false, error: { kind: 'network', message: 'x' } } as never
    await act(async () => {
      store.setState({ inFlight: null, result: r })
      await done.catch(() => undefined)
    })
    await user.click(row('Top'))
    row('Top').focus()
    await user.keyboard('{Enter}')
    expect(store.getState().result).toBe(r)
  })

  it('a failed New folder save does not enter rename and keeps a tab stop', async () => {
    const { col } = seed()
    const { user, api } = await setup([col])
    vi.mocked(api['collections:save']).mockRejectedValueOnce(new Error('disk full'))
    await openMenu(user, 'Alpha')
    await user.click(screen.getByRole('menuitem', { name: 'New folder' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(names()).toEqual(['Alpha', 'Docs', 'Top'])
    expect(screen.getAllByRole('treeitem').filter((r) => r.tabIndex === 0)).toHaveLength(1)
  })

  describe('focus after delete', () => {
    const del = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
      row(name).focus()
      await user.keyboard('{Delete}')
      await user.click(screen.getByRole('button', { name: 'Delete' }))
    }
    const flat = () => {
      const a = req('A')
      const b = req('B')
      const c = req('C')
      return { col: { ...newCollection('Alpha'), items: [a, b, c] } as Collection }
    }

    it('moves focus to the next sibling, then arrow keys keep working', async () => {
      const { user } = await setup([flat().col])
      await del(user, 'B')
      await vi.waitFor(() => expect(row('C')).toHaveFocus())
      await user.keyboard('{ArrowUp}')
      expect(row('A')).toHaveFocus()
    })

    it('falls back to the previous sibling when the last child is deleted', async () => {
      const { user } = await setup([flat().col])
      await del(user, 'C')
      await vi.waitFor(() => expect(row('B')).toHaveFocus())
    })

    it('falls back to the parent when the only child is deleted', async () => {
      const col = { ...newCollection('Alpha'), items: [req('Solo')] } as Collection
      const { user } = await setup([col])
      await del(user, 'Solo')
      await vi.waitFor(() => expect(row('Alpha')).toHaveFocus())
    })

    it('focuses the neighbouring collection after deleting a collection', async () => {
      const { user } = await setup([newCollection('Alpha'), newCollection('Beta')])
      await openMenu(user, 'Alpha')
      await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(row('Beta')).toHaveFocus())
    })

    it('keeps focus on the original row when the delete fails', async () => {
      const { user, api } = await setup([flat().col])
      vi.mocked(api['collections:save']).mockRejectedValueOnce(new Error('disk full'))
      await del(user, 'B')
      await vi.waitFor(() => expect(row('B')).toHaveFocus())
    })
  })

  it('a held Enter or Delete on a row does not repeat its action', async () => {
    const { col } = seed()
    const { store } = await setup([col])
    row('Top').focus()
    fireEvent.keyDown(row('Top'), { key: 'Enter', repeat: true })
    expect(store.getState().active).toBeNull()
    fireEvent.keyDown(row('Top'), { key: 'Delete', repeat: true })
    fireEvent.keyDown(row('Top'), { key: 'Backspace', repeat: true })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(row('Top'), { key: 'Delete' })
    expect(screen.getByRole('dialog', { name: 'Delete “Top”?' })).toBeInTheDocument()
  })

  it('does not swallow Cmd/Ctrl+Enter on a focused row (app-level send shortcut)', async () => {
    const { col } = seed()
    await setup([col])
    row('Top').focus()
    const ev = createEvent.keyDown(row('Top'), { key: 'Enter', metaKey: true })
    fireEvent(row('Top'), ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})
