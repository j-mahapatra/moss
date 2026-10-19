import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from 'fs/promises'
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
    const s = {
      schemaVersion: 1 as const,
      split: 0.3,
      navigatorCollapsed: true,
      activeEnvironmentId: null
    }
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

  it('falls back to defaults when the quarantine rename fails', async () => {
    await writeFile(join(dir, 'settings.json'), '{oops')
    const fs = {
      mkdir,
      writeFile,
      unlink,
      readFile,
      rename: async (): Promise<void> => {
        throw new Error('EPERM')
      }
    }
    const r = await new SettingsRepo(dir, undefined, fs).get()
    expect(r.settings).toEqual(DEFAULT_SETTINGS)
    expect(r.warnings).toEqual([`Couldn't read "settings.json". It was left in place.`])
  })

  it('does not quarantine a settings file written by a concurrent set()', async () => {
    await writeFile(join(dir, 'settings.json'), '{oops')
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fs = {
      mkdir,
      writeFile,
      unlink,
      readFile,
      rename: async (from: string, to: string): Promise<void> => {
        if (to.includes('.corrupt-')) await gate
        return rename(from, to)
      }
    }
    const repo = new SettingsRepo(dir, undefined, fs, () => 3)
    const getting = repo.get()
    await new Promise((r) => setTimeout(r, 20))
    const s = {
      schemaVersion: 1 as const,
      split: 0.4,
      navigatorCollapsed: true,
      activeEnvironmentId: null
    }
    const setting = repo.set(s)
    await new Promise((r) => setTimeout(r, 20))
    release()
    await Promise.all([getting, setting])
    expect((await readdir(dir)).sort()).toEqual(['settings.corrupt-3.json', 'settings.json'])
    expect((await repo.get()).settings).toEqual(s)
  })
})
