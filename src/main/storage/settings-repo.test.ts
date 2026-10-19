import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile
} from 'fs/promises'
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
  it('loads a Plan 2 settings file without activeEnvironmentId as null, untouched', async () => {
    const legacy = { schemaVersion: 1, split: 0.4, navigatorCollapsed: false }
    await writeFile(join(dir, 'settings.json'), JSON.stringify(legacy))
    const r = await new SettingsRepo(dir).get()
    expect(r.warnings).toEqual([])
    expect(r.settings).toEqual({ ...legacy, activeEnvironmentId: null, theme: 'system' })
    expect(await readdir(dir)).toEqual(['settings.json'])
  })

  it('returns defaults when missing', async () => {
    expect(await new SettingsRepo(dir).get()).toEqual({ settings: DEFAULT_SETTINGS, warnings: [] })
  })

  it('round-trips set -> get', async () => {
    const s = {
      schemaVersion: 1 as const,
      split: 0.3,
      navigatorCollapsed: true,
      activeEnvironmentId: null,
      theme: 'system' as const
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
      appendFile,
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
      appendFile,
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
      activeEnvironmentId: null,
      theme: 'system' as const
    }
    const setting = repo.set(s)
    await new Promise((r) => setTimeout(r, 20))
    release()
    await Promise.all([getting, setting])
    expect((await readdir(dir)).sort()).toEqual(['settings.corrupt-3.json', 'settings.json'])
    expect((await repo.get()).settings).toEqual(s)
  })

  describe('tmp sweep', () => {
    const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

    it('removes settings tmp orphans on the first get and leaves other files', async () => {
      await writeFile(join(dir, `settings.json.${U1}.tmp`), 'x')
      await writeFile(join(dir, 'other.json.' + U1 + '.tmp'), 'x')
      await writeFile(join(dir, 'settings.json.notauuid.tmp'), 'x')
      await new SettingsRepo(dir).get()
      expect((await readdir(dir)).sort()).toEqual([
        'other.json.' + U1 + '.tmp',
        'settings.json.notauuid.tmp'
      ])
    })

    it('keeps the tmp file of an in-flight write', async () => {
      await writeFile(join(dir, `settings.json.${U1}.tmp`), 'x')
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      let inflightTmp = ''
      const fs = {
        mkdir,
        unlink,
        readFile,
        appendFile,
        rename,
        writeFile: async (p: string, data: string, enc: 'utf8'): Promise<void> => {
          await writeFile(p, data, enc)
          inflightTmp = p
          await gate
        }
      }
      const repo = new SettingsRepo(dir, undefined, fs)
      const setting = repo.set({
        schemaVersion: 1,
        split: 0.3,
        navigatorCollapsed: true,
        activeEnvironmentId: null,
        theme: 'system'
      })
      await new Promise((r) => setTimeout(r, 20))
      const getting = repo.get()
      await new Promise((r) => setTimeout(r, 20))
      expect(await readdir(dir)).toContain(inflightTmp.split('/').pop())
      release()
      await Promise.all([setting, getting])
      expect(await readdir(dir)).toEqual(['settings.json'])
    })
  })
})
