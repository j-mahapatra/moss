import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Collection, Environment, Settings } from '../../src/shared/types'

export interface SeedData {
  collections?: Collection[]
  environments?: Environment[]
  settings?: Settings
}

/**
 * Writes documents into a user-data folder the way the app stores them: one JSON file per
 * collection and environment, named by id, plus `settings.json`. Values are written as given,
 * so seed secrets only into a run that uses MOSS_SECRETS=plain.
 */
export async function seedUserData(dir: string, data: SeedData): Promise<void> {
  const groups: Array<[string, Array<Collection | Environment>]> = [
    ['collections', data.collections ?? []],
    ['environments', data.environments ?? []]
  ]
  for (const [folder, docs] of groups) {
    if (docs.length === 0) continue
    await mkdir(join(dir, folder), { recursive: true })
    for (const doc of docs) {
      await writeFile(join(dir, folder, `${doc.id}.json`), JSON.stringify(doc))
    }
  }
  if (data.settings) await writeFile(join(dir, 'settings.json'), JSON.stringify(data.settings))
}
