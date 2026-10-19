/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers with inferred fake-api types */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newCollection } from '../../shared/collection-tree'
import { newEnvironment } from '../../shared/environments'
import type { Collection, Environment, KeyValue, Settings } from '../../shared/types'
import { selectActiveEnvironment, selectScope } from './selectors'
import { createWorkspaceStore } from './workspace'

const kv = (key: string, value: string): KeyValue =>
  ({ id: crypto.randomUUID(), key, value, enabled: true }) as KeyValue

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function setup(
  opts: { envs?: Environment[]; cols?: Collection[]; settings?: Partial<Settings> } = {}
) {
  const envDisk = new Map((opts.envs ?? []).map((e) => [e.id, e]))
  const settings: Settings = {
    schemaVersion: 1,
    split: 0.3,
    navigatorCollapsed: false,
    activeEnvironmentId: null,
    theme: 'system',
    ...opts.settings
  }
  const api = {
    'request:send': vi.fn(() => new Promise(() => undefined)),
    'request:cancel': vi.fn(async () => undefined),
    'collections:list': vi.fn(async () => ({ collections: opts.cols ?? [], warnings: [] })),
    'collections:save': vi.fn(async () => undefined),
    'collections:delete': vi.fn(async () => undefined),
    'environments:list': vi.fn(async () => ({ environments: [...envDisk.values()], warnings: [] })),
    'environments:save': vi.fn(async (e: Environment) => void envDisk.set(e.id, e)),
    'environments:delete': vi.fn(async ({ id }: { id: string }) => void envDisk.delete(id)),
    'settings:get': vi.fn(async () => ({ settings, warnings: [] })),
    'settings:set': vi.fn((s: Settings) => Promise.resolve(void s)),
    'history:list': vi.fn(async () => ({ entries: [], warnings: [] })),
    'history:delete': vi.fn(async () => undefined),
    'history:clear': vi.fn(async () => undefined)
  }
  const store = createWorkspaceStore(api as never)
  return { api, store, envDisk }
}

afterEach(() => vi.useRealTimers())

describe('environments', () => {
  it('init loads environments; create inserts sorted and saves', async () => {
    const zed = newEnvironment('Zed')
    const { store, envDisk } = setup({ envs: [zed] })
    await store.getState().init()
    expect(store.getState().environments.map((e) => e.name)).toEqual(['Zed'])
    const e = await store.getState().createEnvironment('  Alpha ')
    expect(e?.name).toBe('Alpha')
    expect(store.getState().environments.map((x) => x.name)).toEqual(['Alpha', 'Zed'])
    expect(envDisk.has(e!.id)).toBe(true)
  })

  it('create failure rolls back with a notice', async () => {
    const { store, api } = setup()
    await store.getState().init()
    api['environments:save'].mockRejectedValueOnce(new Error('full'))
    expect(await store.getState().createEnvironment('Dev')).toBeNull()
    expect(store.getState().environments).toEqual([])
    expect(store.getState().notices.at(-1)).toMatchObject({
      tone: 'danger',
      message: `Couldn't save "Dev": full`
    })
  })

  it('update saves; a failed update rolls back with a notice', async () => {
    const dev = newEnvironment('Dev')
    const { store, api, envDisk } = setup({ envs: [dev] })
    await store.getState().init()
    expect(
      await store.getState().updateEnvironment(dev.id, (e) => ({ ...e, variables: [kv('a', '1')] }))
    ).toBe(true)
    expect(envDisk.get(dev.id)?.variables).toHaveLength(1)
    api['environments:save'].mockRejectedValueOnce(new Error('EACCES'))
    expect(await store.getState().updateEnvironment(dev.id, (e) => ({ ...e, name: 'X' }))).toBe(
      false
    )
    expect(store.getState().environments[0]!.name).toBe('Dev')
    expect(store.getState().notices.at(-1)?.message).toBe(`Couldn't save "Dev": EACCES`)
  })

  it('delete removes; a failed delete keeps it with a notice', async () => {
    const dev = newEnvironment('Dev')
    const { store, api, envDisk } = setup({ envs: [dev] })
    await store.getState().init()
    api['environments:delete'].mockRejectedValueOnce(new Error('locked'))
    expect(await store.getState().deleteEnvironment(dev.id)).toBe(false)
    expect(store.getState().environments).toHaveLength(1)
    expect(store.getState().notices.at(-1)?.message).toBe(`Couldn't delete "Dev": locked`)
    expect(await store.getState().deleteEnvironment(dev.id)).toBe(true)
    expect(store.getState().environments).toEqual([])
    expect(envDisk.size).toBe(0)
  })

  it('duplicateEnvironmentById copies name and variables under a new id; unknown id is null', async () => {
    const dev = { ...newEnvironment('Dev'), variables: [kv('a', '1')] }
    const { store, envDisk } = setup({ envs: [dev] })
    await store.getState().init()
    const copy = await store.getState().duplicateEnvironmentById(dev.id)
    expect(copy?.name).toBe('Dev copy')
    expect(copy?.id).not.toBe(dev.id)
    expect(copy?.variables.map((v) => v.key)).toEqual(['a'])
    expect(envDisk.get(copy!.id)?.name).toBe('Dev copy')
    expect(store.getState().environments.map((e) => e.name)).toEqual(['Dev', 'Dev copy'])
    expect(await store.getState().duplicateEnvironmentById('nope')).toBeNull()
  })

  it('a load failure becomes a danger notice', async () => {
    const { store, api } = setup()
    api['environments:list'].mockRejectedValueOnce(new Error('gone'))
    await store.getState().init()
    expect(store.getState().notices.map((n) => n.message)).toContain(
      "Couldn't load your environments: gone"
    )
  })

  it('deleting the active environment clears the id and schedules a settings save (RF3)', async () => {
    const dev = newEnvironment('Dev')
    const { store, api } = setup({ envs: [dev], settings: { activeEnvironmentId: dev.id } })
    await store.getState().init()
    expect(selectActiveEnvironment(store.getState())?.id).toBe(dev.id)
    vi.useFakeTimers()
    expect(await store.getState().deleteEnvironment(dev.id)).toBe(true)
    expect(store.getState().activeEnvironmentId).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(api['settings:set']).toHaveBeenCalledTimes(1)
    expect(api['settings:set'].mock.calls[0]![0].activeEnvironmentId).toBeNull()
  })

  it('after deleting the active environment, selectScope no longer resolves its variables', async () => {
    const dev = { ...newEnvironment('Dev'), variables: [kv('onlyDev', 'x')] }
    const { store } = setup({ envs: [dev], settings: { activeEnvironmentId: dev.id } })
    await store.getState().init()
    expect(selectScope(store.getState()).get('onlyDev')).toBe('x')
    expect(await store.getState().deleteEnvironment(dev.id)).toBe(true)
    expect(selectScope(store.getState()).has('onlyDev')).toBe(false)
  })

  it('an environments load failure keeps the saved id and later saves persist it unchanged', async () => {
    const dev = newEnvironment('Dev')
    const { store, api } = setup({ envs: [dev], settings: { activeEnvironmentId: dev.id } })
    api['environments:list'].mockRejectedValueOnce(new Error('gone'))
    vi.useFakeTimers()
    await store.getState().init()
    expect(store.getState().notices.map((n) => n.message)).toContain(
      "Couldn't load your environments: gone"
    )
    expect(store.getState().activeEnvironmentId).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(api['settings:set']).not.toHaveBeenCalled()
    store.getState().setSplit(0.4)
    await vi.advanceTimersByTimeAsync(300)
    expect(api['settings:set']).toHaveBeenCalledTimes(1)
    expect(api['settings:set'].mock.calls[0]![0].activeEnvironmentId).toBe(dev.id)
  })

  it('setActiveEnvironment ignores unknown ids', async () => {
    const { store } = setup()
    await store.getState().init()
    store.getState().setActiveEnvironment(crypto.randomUUID())
    expect(store.getState().activeEnvironmentId).toBeNull()
  })

  it('send carries the environment chosen before the settings debounce fires (RF2)', async () => {
    const dev = newEnvironment('Dev')
    const { store, api } = setup({ envs: [dev] })
    await store.getState().init()
    vi.useFakeTimers()
    store.getState().setActiveEnvironment(dev.id)
    void store.getState().send()
    expect(api['settings:set']).not.toHaveBeenCalled()
    expect(api['request:send']).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: dev.id })
    )
  })
})

describe('init and settings', () => {
  it('clears a stale active id and saves the cleared value', async () => {
    vi.useFakeTimers()
    const { store, api } = setup({ settings: { activeEnvironmentId: crypto.randomUUID() } })
    await store.getState().init()
    expect(store.getState().activeEnvironmentId).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(api['settings:set']).toHaveBeenCalledWith(
      expect.objectContaining({ activeEnvironmentId: null, split: 0.3 })
    )
  })

  it('keeps a ⌘B toggle and an environment switch made before init resolves', async () => {
    vi.useFakeTimers()
    const dev = newEnvironment('Dev')
    const { store, api } = setup({
      envs: [dev],
      settings: { activeEnvironmentId: dev.id, navigatorCollapsed: false, split: 0.7 }
    })
    const gate = deferred<void>()
    const real = api['settings:get'].getMockImplementation()!
    api['settings:get'].mockImplementationOnce(async () => {
      await gate.promise
      return real()
    })
    const p = store.getState().init()
    store.getState().toggleNavigator()
    store.getState().setActiveEnvironment(null)
    await vi.advanceTimersByTimeAsync(500)
    gate.resolve()
    await p
    const s = store.getState()
    expect(s.navigatorCollapsed).toBe(true)
    expect(s.activeEnvironmentId).toBeNull()
    expect(s.split).toBe(0.7)
    await vi.advanceTimersByTimeAsync(300)
    expect(api['settings:set']).toHaveBeenLastCalledWith({
      schemaVersion: 1,
      split: 0.7,
      navigatorCollapsed: true,
      activeEnvironmentId: null,
      theme: 'system'
    })
  })

  it('setTheme persists, and a theme chosen before init resolves is kept', async () => {
    vi.useFakeTimers()
    const { store, api } = setup()
    await store.getState().init()
    store.getState().setTheme('dark')
    expect(store.getState().theme).toBe('dark')
    await vi.advanceTimersByTimeAsync(300)
    expect(api['settings:set']).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))

    const loading = setup({ settings: { theme: 'light' } })
    const gate = deferred<void>()
    const real = loading.api['settings:get'].getMockImplementation()!
    loading.api['settings:get'].mockImplementationOnce(async () => {
      await gate.promise
      return real()
    })
    const p = loading.store.getState().init()
    loading.store.getState().setTheme('system')
    gate.resolve()
    await p
    expect(loading.store.getState().theme).toBe('system')
    await vi.advanceTimersByTimeAsync(300)
    expect(loading.api['settings:set']).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'system' })
    )
  })

  it('createCollection called before init resolves waits for it', async () => {
    const existing = newCollection('Existing')
    const { store, api } = setup({ cols: [existing] })
    const gate = deferred<void>()
    api['collections:list'].mockImplementationOnce(async () => {
      await gate.promise
      return { collections: [existing], warnings: [] }
    })
    const p = store.getState().init()
    const created = store.getState().createCollection('New')
    gate.resolve()
    await p
    const c = await created
    expect(
      store
        .getState()
        .collections.map((x) => x.id)
        .sort()
    ).toEqual([existing.id, c!.id].sort())
  })

  it('flushSettings saves at once and cancels the debounce', async () => {
    vi.useFakeTimers()
    const { store, api } = setup()
    await store.getState().init()
    store.getState().setSplit(0.6)
    await store.getState().flushSettings()
    expect(api['settings:set']).toHaveBeenCalledTimes(1)
    expect(api['settings:set'].mock.calls[0]![0].split).toBe(0.6)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api['settings:set']).toHaveBeenCalledTimes(1)
    await store.getState().flushSettings()
    expect(api['settings:set']).toHaveBeenCalledTimes(1)
  })
})

describe('selectScope', () => {
  it('environment variables beat collection variables, and the Map is memoized', async () => {
    const dev = { ...newEnvironment('Dev'), variables: [kv('host', 'env'), kv('only', 'e')] }
    const col = { ...newCollection('C'), variables: [kv('host', 'col'), kv('c', '1')] }
    const { store } = setup({ envs: [dev], cols: [col], settings: { activeEnvironmentId: dev.id } })
    await store.getState().init()
    store.setState({ active: { collectionId: col.id, requestId: 'r' } })
    const first = selectScope(store.getState())
    expect(first.get('host')).toBe('env')
    expect(first.get('only')).toBe('e')
    expect(first.get('c')).toBe('1')
    store.getState().setSplit(0.4)
    store.getState().updateDraft({ url: 'x' })
    expect(selectScope(store.getState())).toBe(first)
    await store.getState().updateEnvironment(dev.id, (e) => ({ ...e, variables: [] }))
    const next = selectScope(store.getState())
    expect(next).not.toBe(first)
    expect(next.get('host')).toBe('col')
  })
})
