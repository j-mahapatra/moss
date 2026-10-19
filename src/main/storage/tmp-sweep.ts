import { readdir, unlink } from 'fs/promises'
import { join } from 'path'

const UUID = '[0-9a-f-]{36}'

/**
 * Removes atomic-write orphans (`<prefix>.<uuid>.tmp`) from `dir`. Best effort.
 * Call it inside the file's queue slot so no write to that file is in flight.
 */
export async function sweepTmp(
  dir: string,
  prefix: string,
  remove: (path: string) => Promise<void> = unlink
): Promise<void> {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${UUID}\\.tmp$`)
  try {
    for (const name of await readdir(dir)) {
      if (!re.test(name)) continue
      try {
        await remove(join(dir, name))
      } catch {
        // best effort
      }
    }
  } catch {
    // best effort
  }
}
