/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newEnvironment } from '../../../shared/environments'
import type { Environment, KeyValue } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { EnvironmentsPanel } from './EnvironmentsPanel'

const kv = (key: string, value: string): KeyValue =>
  ({ id: crypto.randomUUID(), key, value, enabled: true }) as KeyValue
const env = (name: string, variables: KeyValue[] = []): Environment => ({
  ...newEnvironment(name),
  variables
})

async function setup(envs: Environment[] = [], activeId: string | null = null) {
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(),
    ...noopExtras(),
    'environments:list': vi.fn(async () => ({ environments: envs, warnings: [] })),
    'settings:get': vi.fn(async () => ({
      settings: {
        schemaVersion: 1 as const,
        split: 0.5,
        navigatorCollapsed: false,
        activeEnvironmentId: activeId
      },
      warnings: []
    }))
  }
  const store = createWorkspaceStore(api as never)
  render(
    <WorkspaceProvider store={store}>
      <EnvironmentsPanel />
    </WorkspaceProvider>
  )
  await act(async () => {
    await store.getState().init()
  })
  return { api, store, user: userEvent.setup() }
}

const row = (name: string) => screen.getByRole('listitem', { name })
const names = () => screen.getAllByRole('listitem').map((r) => r.getAttribute('aria-label'))

async function pick(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(within(row(name)).getByRole('button', { name: 'More actions' }))
  await user.click(screen.getByRole('menuitem', { name: item }))
}

describe('EnvironmentsPanel', () => {
  it('shows the empty state, then creates and enters rename mode', async () => {
    const { store, user } = await setup()
    expect(screen.getByRole('complementary', { name: 'Environments' })).toBeInTheDocument()
    expect(screen.getByText('No environments yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create environment' }))
    const input = await screen.findByRole('textbox', { name: 'Rename' })
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, 'Staging{Enter}')
    expect(store.getState().environments.map((e) => e.name)).toEqual(['Staging'])
    await waitFor(() => expect(row('Staging')).toHaveFocus())
  })

  it('lists environments sorted, marks the active one, and offers the menu in order', async () => {
    const a = env('alpha')
    const b = env('Beta')
    const { user } = await setup([b, a], b.id)
    expect(names()).toEqual(['alpha', 'Beta'])
    expect(within(row('Beta')).getByText('Active')).toBeInTheDocument()
    expect(within(row('alpha')).queryByText('Active')).toBeNull()
    await user.click(within(row('Beta')).getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Deactivate',
      'Edit variables…',
      'Rename',
      'Duplicate',
      'Delete'
    ])
  })

  it('Set active and Deactivate update the active environment', async () => {
    const a = env('alpha')
    const { store, user } = await setup([a])
    await pick(user, 'alpha', 'Set active')
    expect(store.getState().activeEnvironmentId).toBe(a.id)
    await pick(user, 'alpha', 'Deactivate')
    expect(store.getState().activeEnvironmentId).toBeNull()
  })

  it('Rename commits on Enter and cancels on Esc', async () => {
    const a = env('alpha')
    const { store, user } = await setup([a])
    await pick(user, 'alpha', 'Rename')
    await user.keyboard('{Escape}')
    expect(store.getState().environments[0]!.name).toBe('alpha')
    await pick(user, 'alpha', 'Rename')
    await user.keyboard('{Control>}a{/Control}zed{Enter}')
    await waitFor(() => expect(store.getState().environments[0]!.name).toMatch(/zed$/))
  })

  it('Duplicate adds "<name> copy"', async () => {
    const a = env('alpha', [kv('k', 'v')])
    const { store, user } = await setup([a])
    await pick(user, 'alpha', 'Duplicate')
    await waitFor(() => expect(names()).toEqual(['alpha', 'alpha copy']))
    expect(
      store.getState().environments.find((e) => e.name === 'alpha copy')?.variables
    ).toHaveLength(1)
  })

  it('Edit variables opens the dialog; Save persists and closes', async () => {
    const a = env('alpha')
    const { store, user } = await setup([a])
    await pick(user, 'alpha', 'Edit variables…')
    const dialog = await screen.findByRole('dialog', { name: 'Variables · alpha' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Key 1' }), 'host')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(store.getState().environments[0]!.variables.map((v) => v.key)).toEqual(['host'])
  })

  it('Enter and double-click on a row open Edit variables; Cancel discards', async () => {
    const a = env('alpha')
    const { store, user } = await setup([a])
    row('alpha').focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Variables · alpha' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.dblClick(row('alpha'))
    expect(await screen.findByRole('dialog', { name: 'Variables · alpha' })).toBeInTheDocument()
    expect(store.getState().environments[0]!.variables).toEqual([])
  })

  it('the dialog closes if its environment vanishes', async () => {
    const a = env('alpha')
    const { store, user } = await setup([a])
    await user.dblClick(row('alpha'))
    await screen.findByRole('dialog')
    await act(async () => {
      await store.getState().deleteEnvironment(a.id)
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('deleting the active environment warns, clears it, and focuses the next row', async () => {
    const a = env('alpha')
    const b = env('beta')
    const { store, user } = await setup([a, b], a.id)
    await pick(user, 'alpha', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete “alpha”?' })
    expect(dialog).toHaveTextContent(
      "This can't be undone. Requests will stop using its variables."
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(row('beta')).toHaveFocus())
    expect(store.getState().activeEnvironmentId).toBeNull()
    expect(names()).toEqual(['beta'])
  })

  it('deleting an inactive last row focuses the previous row, then New environment', async () => {
    const a = env('alpha')
    const b = env('beta')
    const { user } = await setup([a, b])
    await pick(user, 'beta', 'Delete')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).not.toHaveTextContent('Requests will stop')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(row('alpha')).toHaveFocus())
    await pick(user, 'alpha', 'Delete')
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New environment' })).toHaveFocus()
    )
    expect(screen.getByText('No environments yet')).toBeInTheDocument()
  })

  it('F2 renames the focused row', async () => {
    const a = env('alpha')
    const { user } = await setup([a])
    row('alpha').focus()
    await user.keyboard('{F2}')
    expect(await screen.findByRole('textbox', { name: 'Rename' })).toHaveFocus()
  })

  it.each(['{Delete}', '{Backspace}'])('%s on a row asks to delete it', async (key) => {
    const a = env('alpha')
    const { user } = await setup([a])
    row('alpha').focus()
    await user.keyboard(key)
    expect(await screen.findByRole('dialog', { name: 'Delete “alpha”?' })).toBeInTheDocument()
  })

  it('ContextMenu and Shift+F10 open the row menu', async () => {
    const a = env('alpha')
    const { user } = await setup([a])
    row('alpha').focus()
    await user.keyboard('{ContextMenu}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    row('alpha').focus()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('right-click opens the row menu', async () => {
    const a = env('alpha')
    const { user } = await setup([a])
    await user.pointer({ keys: '[MouseRight]', target: row('alpha') })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('double-click inside the rename input does not open the dialog', async () => {
    const a = env('alpha')
    const { user } = await setup([a])
    await pick(user, 'alpha', 'Rename')
    const input = await screen.findByRole('textbox', { name: 'Rename' })
    await user.dblClick(input)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Rename' })).toBeInTheDocument()
  })

  it('double-click on More actions does not open the dialog', async () => {
    const a = env('alpha')
    const { user } = await setup([a])
    await user.dblClick(within(row('alpha')).getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('dialog', { name: 'Variables · alpha' })).toBeNull()
  })
})
