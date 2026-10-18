/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, render, screen } from '@testing-library/react'
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
})
