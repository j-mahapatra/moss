import { describe, expect, it, vi } from 'vitest'
import { newCollection, newFolder, toItem } from '../../../shared/collection-tree'
import { newRequestSpec, type Collection, type Environment } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { buildPaletteItems, type PaletteActions, type PaletteState } from './palette-items'

const env = (id: string, name: string): Environment => ({
  id,
  name,
  variables: [],
  schemaVersion: 1
})

function fixture(): { collections: Collection[]; ids: Record<string, string> } {
  const api = newCollection('API')
  const users = { ...newRequestSpec(), name: 'List users', method: 'GET' as const }
  const create = { ...newRequestSpec(), name: 'Create user', method: 'POST' as const }
  const health = { ...newRequestSpec(), name: 'Health', method: 'HEAD' as const }
  const outer = newFolder('Users')
  const inner = newFolder('Admin')
  inner.items.push(toItem(create))
  outer.items.push(toItem(users), inner)
  api.items.push(outer, toItem(health))
  const other = newCollection('Billing')
  const invoice = { ...newRequestSpec(), name: 'Invoices', method: 'DELETE' as const }
  other.items.push(toItem(invoice))
  return {
    collections: [api, other],
    ids: {
      api: api.id,
      other: other.id,
      users: users.id,
      create: create.id,
      health: health.id,
      invoice: invoice.id
    }
  }
}

function actions(): { [K in keyof PaletteActions]: ReturnType<typeof vi.fn> } {
  return {
    newRequest: vi.fn(() => 'opened' as const),
    openRequest: vi.fn(() => 'opened' as const),
    setConfirmDiscard: vi.fn(),
    showPanel: vi.fn(),
    setTheme: vi.fn(),
    setActiveEnvironment: vi.fn()
  }
}

function state(over: Partial<PaletteState> = {}): PaletteState {
  return {
    theme: 'system',
    environments: [],
    activeEnvironmentId: null,
    collections: [],
    ...over
  }
}

describe('buildPaletteItems', () => {
  it('shows the New request shortcut with the platform modifier', () => {
    const build = (): string | undefined =>
      buildPaletteItems(
        state({ theme: 'system', environments: [], activeEnvironmentId: null, collections: [] }),
        actions() as unknown as PaletteActions
      ).find((i) => i.id === 'command:new-request')?.hint
    const platform = vi.spyOn(navigator, 'platform', 'get')
    try {
      platform.mockReturnValue('MacIntel')
      expect(build()).toBe('⌘N')
      platform.mockReturnValue('Win32')
      expect(build()).toBe('Ctrl+N')
    } finally {
      platform.mockRestore()
    }
  })

  it('lists commands, environments, then requests with exact labels, details and badges', () => {
    const { collections } = fixture()
    const items = buildPaletteItems(
      state({
        theme: 'dark',
        // Out of name order on purpose: the palette sorts them.
        environments: [env('e2', 'staging'), env('e1', 'Local')],
        activeEnvironmentId: 'e2',
        collections
      }),
      actions() as unknown as PaletteActions
    )
    expect(
      items.map(({ group, label, detail, hint, badge }) => ({ group, label, detail, hint, badge }))
    ).toEqual([
      {
        group: 'Commands',
        label: 'New request',
        detail: undefined,
        hint: 'Ctrl+N',
        badge: undefined
      },
      { group: 'Commands', label: 'Import…', detail: undefined, hint: undefined, badge: undefined },
      {
        group: 'Commands',
        label: 'Theme: Match system',
        detail: undefined,
        hint: undefined,
        badge: undefined
      },
      {
        group: 'Commands',
        label: 'Theme: Light',
        detail: undefined,
        hint: undefined,
        badge: undefined
      },
      {
        group: 'Commands',
        label: 'Theme: Dark',
        detail: undefined,
        hint: undefined,
        badge: 'Current'
      },
      {
        group: 'Environments',
        label: 'Use environment: Local',
        detail: undefined,
        hint: undefined,
        badge: undefined
      },
      {
        group: 'Environments',
        label: 'Use environment: staging',
        detail: undefined,
        hint: undefined,
        badge: 'Active'
      },
      {
        group: 'Environments',
        label: 'Use no environment',
        detail: undefined,
        hint: undefined,
        badge: undefined
      },
      {
        group: 'Requests',
        label: 'List users',
        detail: 'API / Users',
        hint: undefined,
        badge: 'GET'
      },
      {
        group: 'Requests',
        label: 'Create user',
        detail: 'API / Users / Admin',
        hint: undefined,
        badge: 'POST'
      },
      { group: 'Requests', label: 'Health', detail: 'API', hint: undefined, badge: 'HEAD' },
      {
        group: 'Requests',
        label: 'Invoices',
        detail: 'Billing',
        hint: undefined,
        badge: 'DELETE'
      }
    ])
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('marks the current theme preference, including Match system', () => {
    const items = buildPaletteItems(state(), actions() as unknown as PaletteActions)
    expect(items.filter((i) => i.badge === 'Current').map((i) => i.label)).toEqual([
      'Theme: Match system'
    ])
  })

  it('marks Use no environment Active only while no environment is active', () => {
    const a = actions() as unknown as PaletteActions
    const environments = [env('e1', 'Dev')]
    const none = buildPaletteItems(state({ environments }), a)
    expect(none.filter((i) => i.badge === 'Active').map((i) => i.label)).toEqual([
      'Use no environment'
    ])
    const dev = buildPaletteItems(state({ environments, activeEnvironmentId: 'e1' }), a)
    expect(dev.filter((i) => i.badge === 'Active').map((i) => i.label)).toEqual([
      'Use environment: Dev'
    ])
  })

  it('runs each command and environment item through its action', () => {
    const a = actions()
    const items = buildPaletteItems(
      state({ environments: [env('e1', 'Local')] }),
      a as unknown as PaletteActions
    )
    const run = (label: string): void => items.find((i) => i.label === label)?.run()
    run('Import…')
    expect(a.showPanel).toHaveBeenCalledWith('import')
    run('Theme: Match system')
    run('Theme: Light')
    run('Theme: Dark')
    expect(a.setTheme.mock.calls).toEqual([['system'], ['light'], ['dark']])
    run('Use environment: Local')
    run('Use no environment')
    expect(a.setActiveEnvironment.mock.calls).toEqual([['e1'], [null]])
    run('New request')
    expect(a.newRequest).toHaveBeenCalledTimes(1)
    expect(a.setConfirmDiscard).not.toHaveBeenCalled()
  })

  it('opens a request by ref', () => {
    const { collections, ids } = fixture()
    const a = actions()
    const items = buildPaletteItems(state({ collections }), a as unknown as PaletteActions)
    items.find((i) => i.label === 'Create user')?.run()
    expect(a.openRequest).toHaveBeenCalledWith({ collectionId: ids.api, requestId: ids.create })
    expect(a.setConfirmDiscard).not.toHaveBeenCalled()
  })

  it('asks to discard an edited unsaved draft before New request or opening a request', async () => {
    const { collections, ids } = fixture()
    const store = createWorkspaceStore({
      'request:send': vi.fn(),
      'request:cancel': vi.fn(async () => undefined),
      ...noopExtras(),
      'collections:list': vi.fn(async () => ({ collections, warnings: [] }))
    } as never)
    await store.getState().init()
    store.getState().updateDraft({ url: 'http://edited' })
    const draftId = store.getState().draft.id

    const items = buildPaletteItems(store.getState(), store.getState())
    items.find((i) => i.label === 'New request')?.run()
    expect(store.getState().ui.confirmDiscard).toEqual({ then: 'new' })
    expect(store.getState().draft.id).toBe(draftId)

    store.getState().setConfirmDiscard(null)
    items.find((i) => i.label === 'Invoices')?.run()
    expect(store.getState().ui.confirmDiscard).toEqual({
      then: 'open',
      ref: { collectionId: ids.other, requestId: ids.invoice }
    })
    expect(store.getState().active).toBeNull()
    expect(store.getState().draft.url).toBe('http://edited')
  })
})
