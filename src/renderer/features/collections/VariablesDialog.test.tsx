/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newCollection } from '../../../shared/collection-tree'
import type { Collection } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { VariablesDialog } from './VariablesDialog'

async function setup(col: Collection) {
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(),
    ...noopExtras(),
    'collections:list': vi.fn(async () => ({ collections: [col], warnings: [] }))
  }
  const store = createWorkspaceStore(api as never)
  await store.getState().init()
  render(
    <WorkspaceProvider store={store}>
      <VariablesDialog />
    </WorkspaceProvider>
  )
  act(() => store.getState().openVariables(col.id))
  return { api, store }
}

describe('VariablesDialog', () => {
  it('titles the dialog with the collection name and Save persists variables', async () => {
    const user = userEvent.setup()
    const col = newCollection('Shop')
    const { store, api } = await setup(col)
    expect(await screen.findByRole('dialog', { name: 'Variables · Shop' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Key 1'), 'base')
    await user.type(screen.getByLabelText('Value 1'), 'http://h')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(store.getState().ui.variablesFor).toBeNull())
    expect(store.getState().collections[0]?.variables).toEqual([
      { key: 'base', value: 'http://h', enabled: true }
    ])
    expect(api['collections:save']).toHaveBeenCalled()
  })

  it('Cancel discards edits', async () => {
    const user = userEvent.setup()
    const { store, api } = await setup(newCollection('Shop'))
    await user.type(await screen.findByLabelText('Key 1'), 'x')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(store.getState().ui.variablesFor).toBeNull()
    expect(store.getState().collections[0]?.variables).toEqual([])
    expect(api['collections:save']).not.toHaveBeenCalled()
  })

  it('marking a variable secret masks it and persists secret: true through Save', async () => {
    const user = userEvent.setup()
    const col = { ...newCollection('Shop'), variables: [{ key: 'k', value: 's3', enabled: true }] }
    const { store } = await setup(col)
    const dialog = await screen.findByRole('dialog', { name: 'Variables · Shop' })
    expect(within(dialog).getByLabelText('Value 1')).not.toHaveAttribute('type', 'password')
    expect(within(dialog).getAllByRole('button', { name: /^Mark .* secret$/ })).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Mark k secret' }))
    expect(within(dialog).getByLabelText('Value 1')).toHaveAttribute('type', 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(store.getState().ui.variablesFor).toBeNull())
    expect(store.getState().collections[0]?.variables).toEqual([
      { key: 'k', value: 's3', enabled: true, secret: true }
    ])
  })

  it('a failed save reports a notice itself and keeps the dialog open', async () => {
    // KeyValueDialog raises no notice of its own; its callers report failures.
    const user = userEvent.setup()
    const { store, api } = await setup(newCollection('Shop'))
    vi.mocked(api['collections:save']).mockRejectedValueOnce(new Error('disk full'))
    await user.type(await screen.findByLabelText('Key 1'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(store.getState().notices.map((n) => [n.tone, n.message])).toEqual([
        ['danger', `Couldn't save "Shop": disk full`]
      ])
    )
    expect(screen.getByRole('dialog', { name: 'Variables · Shop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('opens saved secret variables masked', async () => {
    const col = {
      ...newCollection('Shop'),
      variables: [{ key: 'k', value: 's3', enabled: true, secret: true }]
    }
    await setup(col)
    const dialog = await screen.findByRole('dialog', { name: 'Variables · Shop' })
    expect(within(dialog).getByLabelText('Value 1')).toHaveAttribute('type', 'password')
    expect(within(dialog).getByRole('button', { name: 'Mark k secret' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
