/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { newCollection, newFolder, insertItem } from '../../../shared/collection-tree'
import { newRequestSpec, type Collection, type HistoryEntry } from '../../../shared/types'
import { byName } from '../../state/slices/collections'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { SaveDialog } from './SaveDialog'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
})

async function setup(cols: Collection[], entries: HistoryEntry[] = []) {
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(),
    ...noopExtras(),
    'collections:list': vi.fn(async () => ({ collections: cols, warnings: [] })),
    'history:list': vi.fn(async () => ({ entries, warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  await store.getState().init()
  render(
    <WorkspaceProvider store={store}>
      <SaveDialog />
    </WorkspaceProvider>
  )
  return { api, store }
}

const open = (store: Awaited<ReturnType<typeof setup>>['store']) =>
  act(() => store.getState().openSaveDialog(true))

describe('SaveDialog', () => {
  it('defaults the name to METHOD + path for an untitled request with a URL', async () => {
    const { store } = await setup([newCollection('A')])
    act(() => store.getState().updateDraft({ method: 'POST', url: 'https://a.io/u?x=1' }))
    open(store)
    expect(await screen.findByLabelText('Name')).toHaveValue('POST /u?x=1')
  })

  it('keeps a custom draft name, and falls back to Untitled request', async () => {
    const { store } = await setup([newCollection('A')])
    act(() => store.getState().updateDraft({ name: 'Mine' }))
    open(store)
    expect(await screen.findByLabelText('Name')).toHaveValue('Mine')
    act(() => store.getState().openSaveDialog(false))
    act(() => store.getState().updateDraft({ name: 'Untitled request', url: '' }))
    open(store)
    expect(await screen.findByLabelText('Name')).toHaveValue('Untitled request')
  })

  it('saves into a nested folder', async () => {
    const user = userEvent.setup()
    const f = newFolder('Users')
    const col = insertItem(newCollection('A'), null, f)
    const { store } = await setup([col])
    const saveAs = vi.spyOn(store.getState(), 'saveAs')
    store.setState({ saveAs })
    open(store)
    await user.click(await screen.findByRole('combobox', { name: 'Folder' }))
    await user.click(await screen.findByRole('option', { name: 'Users' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveAs).toHaveBeenCalledWith({
      collectionId: col.id,
      folderId: f.id,
      name: 'Untitled request'
    })
    await vi.waitFor(() => expect(store.getState().ui.saveDialogOpen).toBe(false))
  })

  it('creates "My collection" first when there are none', async () => {
    const user = userEvent.setup()
    const { store } = await setup([])
    open(store)
    expect(await screen.findByLabelText('New collection name')).toHaveValue('My collection')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(store.getState().ui.saveDialogOpen).toBe(false))
    const [c] = store.getState().collections
    expect(c?.name).toBe('My collection')
    expect(c?.items).toHaveLength(1)
  })

  it('disables Save for an empty name', async () => {
    const user = userEvent.setup()
    const { store } = await setup([newCollection('A')])
    open(store)
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('stays open with an inline alert when the target vanished', async () => {
    const user = userEvent.setup()
    const { store } = await setup([newCollection('A')])
    store.setState({ saveAs: async () => 'gone' })
    open(store)
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That collection or folder no longer exists. Pick another.'
    )
    expect(store.getState().ui.saveDialogOpen).toBe(true)
  })

  it('does not show the alert when the failed save raised its own notice', async () => {
    const user = userEvent.setup()
    const { store } = await setup([newCollection('A')])
    store.setState({
      saveAs: async () => {
        store.setState((st) => ({
          notices: [...st.notices, { id: 'n1', tone: 'danger', message: 'disk full' }]
        }))
        return 'failed'
      }
    })
    open(store)
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(store.getState().ui.saveDialogOpen).toBe(true)
  })

  it('selects the created collection when saveAs fails after createCollection', async () => {
    const user = userEvent.setup()
    const { store } = await setup([])
    store.setState({ saveAs: async () => 'failed' })
    open(store)
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('combobox', { name: 'Collection' })).toHaveTextContent(
      'My collection'
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('passes the trimmed name to saveAs', async () => {
    const user = userEvent.setup()
    const { store } = await setup([newCollection('A')])
    const saveAs = vi.fn(async () => 'saved' as const)
    store.setState({ saveAs })
    open(store)
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, '  Spaced  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveAs).toHaveBeenCalledWith(expect.objectContaining({ name: 'Spaced' }))
  })

  it('shows no alert for two consecutive identical save failures', async () => {
    const user = userEvent.setup()
    const { store, api } = await setup([newCollection('A')])
    ;(api as Record<string, unknown>)['collections:save'] = vi.fn(async () => {
      throw new Error('disk full')
    })
    open(store)
    const save = await screen.findByRole('button', { name: 'Save' })
    await user.click(save)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(api['collections:save']).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(store.getState().ui.saveDialogOpen).toBe(true)
  })

  it('orders collections like the navigator (case/accent-insensitive)', async () => {
    const user = userEvent.setup()
    const cols = ['b', 'Á', 'a', 'B'].map((n) => newCollection(n))
    const { store } = await setup(cols)
    open(store)
    await user.click(await screen.findByRole('combobox', { name: 'Collection' }))
    const shown = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(shown).toEqual([...cols].sort(byName).map((c) => c.name))
  })

  it('defaults to the collection of a draft reopened from history', async () => {
    const [a, b] = [newCollection('A'), newCollection('B')]
    const e: HistoryEntry = {
      id: crypto.randomUUID(),
      at: '2026-10-19T10:00:00.000Z',
      request: { ...newRequestSpec(), url: 'http://b.io' },
      status: 200,
      durationMs: 1,
      collectionId: b.id
    }
    const { store } = await setup([a, b], [e])
    act(() => void store.getState().openHistoryEntry(e.id))
    open(store)
    expect(await screen.findByRole('combobox', { name: 'Collection' })).toHaveTextContent('B')
  })
})
