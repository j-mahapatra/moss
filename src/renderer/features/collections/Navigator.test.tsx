/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newCollection } from '../../../shared/collection-tree'
import type { Collection } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { Navigator } from './Navigator'

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
  return { api, store }
}

describe('Navigator', () => {
  it('shows Loading before init, then the empty state', async () => {
    const { store } = await setup([])
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await act(async () => {
      await store.getState().init()
    })
    expect(await screen.findByText('No collections yet')).toBeInTheDocument()
  })

  it('both buttons create a collection', async () => {
    const { store, api } = await setup([])
    await act(async () => {
      await store.getState().init()
    })
    const nav = await screen.findByRole('complementary', { name: 'Collections' })
    const user = userEvent.setup()
    await user.click(within(nav).getByRole('button', { name: 'Create collection' }))
    await user.click(within(nav).getByRole('button', { name: 'New collection' }))
    expect(api['collections:save']).toHaveBeenCalledTimes(2)
    expect(store.getState().collections.map((c) => c.name)).toEqual([
      'New collection',
      'New collection'
    ])
  })

  it('lists collection names', async () => {
    const { store } = await setup([newCollection('Alpha'), newCollection('Beta')])
    await act(async () => {
      await store.getState().init()
    })
    const list = await screen.findByRole('list')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Alpha', 'Beta'])
  })
})
