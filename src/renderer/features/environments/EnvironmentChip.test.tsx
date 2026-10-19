/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers with inferred fake-api types */
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newEnvironment } from '../../../shared/environments'
import type { Environment, KeyValue } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { TopBar } from '../shell/TopBar'

const env = (name: string, variables: KeyValue[] = []): Environment => ({
  ...newEnvironment(name),
  variables
})

async function setup(envs: Environment[] = [], activeId: string | null = null) {
  const extras = noopExtras()
  const api = {
    'request:send': vi.fn(() => new Promise<never>(() => undefined)),
    'request:cancel': vi.fn(async () => undefined),
    ...extras,
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
  await store.getState().init()
  const user = userEvent.setup()
  render(
    <WorkspaceProvider store={store}>
      <TopBar />
    </WorkspaceProvider>
  )
  return { api, store, user }
}

const openPopover = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await user.click(screen.getByRole('button', { name }))
  return screen.getByRole('dialog', { name: 'Environments' })
}

describe('EnvironmentChip', () => {
  it('names the chip after the active environment, or none', async () => {
    const prod = env('prod')
    await setup([prod], prod.id)
    expect(screen.getByRole('button', { name: 'Environment: prod' })).toHaveTextContent('prod')
  })

  it('reads "none" when no environment is active', async () => {
    await setup([env('prod')])
    expect(screen.getByRole('button', { name: 'Environment: none' })).toHaveTextContent(
      'No environment'
    )
  })

  it('lists No environment first, then environments by name; selecting one activates it', async () => {
    const prod = env('prod')
    const dev = env('dev')
    const { user, store } = await setup([prod, dev])
    const dialog = await openPopover(user, /Environment: none/)
    const group = within(dialog).getByRole('group', { name: 'Active environment' })
    const radios = within(group).getAllByRole('radio')
    expect(
      radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)
    ).toEqual(['No environment', 'dev', 'prod'])
    await user.click(within(dialog).getByRole('radio', { name: 'prod' }))
    expect(store.getState().activeEnvironmentId).toBe(prod.id)
    expect(screen.getByRole('dialog', { name: 'Environments' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'No environment' }))
    expect(store.getState().activeEnvironmentId).toBeNull()
  })

  it('saves edited variables; Save is disabled until something changes', async () => {
    const prod = env('prod', [{ key: 'host', value: 'a', enabled: true }])
    const { user, api } = await setup([prod], prod.id)
    const dialog = await openPopover(user, /Environment: prod/)
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    const value = within(dialog).getByLabelText('Value 1')
    await user.clear(value)
    await user.type(value, 'b')
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() =>
      expect(api['environments:save']).toHaveBeenCalledWith(
        expect.objectContaining({
          id: prod.id,
          variables: [{ key: 'host', value: 'b', enabled: true }]
        })
      )
    )
    await waitFor(() => expect(save).toBeDisabled())
  })

  it('hides Variables when no environment is active', async () => {
    const { user } = await setup([env('prod')])
    const dialog = await openPopover(user, /Environment: none/)
    expect(within(dialog).queryByText('Variables')).not.toBeInTheDocument()
  })

  it('throws away unsaved edits when switching environments', async () => {
    const a = env('a', [{ key: 'k', value: '1', enabled: true }])
    const b = env('b', [{ key: 'k', value: '2', enabled: true }])
    const { user } = await setup([a, b], a.id)
    const dialog = await openPopover(user, /Environment: a/)
    await user.type(within(dialog).getByLabelText('Value 1'), 'x')
    await user.click(within(dialog).getByRole('radio', { name: 'b' }))
    expect(within(dialog).getByLabelText('Value 1')).toHaveValue('2')
    await user.click(within(dialog).getByRole('radio', { name: 'a' }))
    expect(within(dialog).getByLabelText('Value 1')).toHaveValue('1')
  })

  it('shows store edits made elsewhere while the copy is clean', async () => {
    const a = env('a', [{ key: 'k', value: '1', enabled: true }])
    const { user, store } = await setup([a], a.id)
    const dialog = await openPopover(user, /Environment: a/)
    await store.getState().updateEnvironment(a.id, (e) => ({
      ...e,
      variables: [{ key: 'k', value: '9', enabled: true }]
    }))
    await waitFor(() => expect(within(dialog).getByLabelText('Value 1')).toHaveValue('9'))
  })

  it('creates and activates an environment from the empty state', async () => {
    const { user, store, api } = await setup()
    const dialog = await openPopover(user, /Environment: none/)
    expect(within(dialog).getAllByRole('radio')).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Create environment' }))
    await waitFor(() => expect(store.getState().environments).toHaveLength(1))
    const created = store.getState().environments[0]!
    expect(created.name).toBe('New environment')
    expect(store.getState().activeEnvironmentId).toBe(created.id)
    expect(api['environments:save']).toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Environments' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'New environment' })).toBeChecked()
  })

  it('"Manage environments" shows the environments panel and closes the popover', async () => {
    const { user, store } = await setup([env('prod')])
    store.getState().toggleNavigator()
    const dialog = await openPopover(user, /Environment: none/)
    await user.click(within(dialog).getByRole('button', { name: 'Manage environments' }))
    expect(store.getState().ui.navigatorView).toBe('environments')
    expect(store.getState().navigatorCollapsed).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Environments' })).not.toBeInTheDocument()
  })

  it('blocks Esc while variables are dirty, then Discard lets Esc close', async () => {
    const a = env('a', [{ key: 'k', value: '1', enabled: true }])
    const { user } = await setup([a], a.id)
    const dialog = await openPopover(user, /Environment: a/)
    await user.type(within(dialog).getByLabelText('Value 1'), 'x')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Save or discard your changes')
    expect(within(dialog).getByRole('button', { name: 'Manage environments' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Environments' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }))
    expect(within(dialog).getByLabelText('Value 1')).toHaveValue('1')
    expect(within(dialog).queryByRole('status')).toBeNull()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Environments' })).toBeNull()
  })

  it('blocks outside clicks while dirty', async () => {
    const a = env('a', [{ key: 'k', value: '1', enabled: true }])
    const { user } = await setup([a], a.id)
    const dialog = await openPopover(user, /Environment: a/)
    await user.type(within(dialog).getByLabelText('Value 1'), 'x')
    await user.click(document.body)
    expect(screen.getByRole('dialog', { name: 'Environments' })).toBeInTheDocument()
  })

  it('keeps rows typed while a save is in flight', async () => {
    const a = env('a', [{ key: 'k', value: '1', enabled: true }])
    const { user, api } = await setup([a], a.id)
    let release!: () => void
    ;(api['environments:save'] as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise<void>((r) => (release = r))
    )
    const dialog = await openPopover(user, /Environment: a/)
    const value = within(dialog).getByLabelText('Value 1')
    await user.type(value, 'x')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await user.type(value, 'y')
    release()
    await waitFor(() => expect(api['environments:save']).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(within(dialog).getByLabelText('Value 1')).toHaveValue('1xy')
  })
})
