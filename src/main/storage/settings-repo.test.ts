import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { SettingsRepo } from './settings-repo'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moss-set-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SettingsRepo', () => {
  it('returns defaults when missing', async () => {
    expect(await new SettingsRepo(dir).get()).toEqual({ settings: DEFAULT_SETTINGS, warnings: [] })
  })

  it('round-trips set -> get', async () => {
    const s = { schemaVersion: 1 as const, split: 0.3, navigatorCollapsed: true }
    await new SettingsRepo(dir).set(s)
    expect(await new SettingsRepo(dir).get()).toEqual({ settings: s, warnings: [] })
  })

  it('quarantines corrupt settings and returns defaults with a warning', async () => {
    await writeFile(join(dir, 'settings.json'), '{oops')
    const r = await new SettingsRepo(dir, undefined, undefined, () => 77).get()
    expect(r.settings).toEqual(DEFAULT_SETTINGS)
    expect(r.warnings).toEqual([
      `Couldn't read "settings.json". It was moved aside as "settings.corrupt-77.json".`
    ])
    expect((await readdir(dir)).sort()).toEqual(['settings.corrupt-77.json'])
  })

  it('quarantines schema-invalid settings', async () => {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ split: 'wide' }))
    const r = await new SettingsRepo(dir, undefined, undefined, () => 5).get()
    expect(r.settings).toEqual(DEFAULT_SETTINGS)
    expect(r.warnings).toHaveLength(1)
  })
})
