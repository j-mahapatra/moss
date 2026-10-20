import { readdir, unlink } from 'fs/promises'
import { join } from 'path'

/** A lowercase 8-4-4-4-12 hex uuid, as `randomUUID()` writes it (source text for a RegExp). */
export const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * Wraps a sweep so it runs on the first call only; later calls resolve at once, even while the
 * first is still running. The flag is set before the sweep starts.
 */
export function onceSwept(sweep: () => Promise<void>): () => Promise<void> {
  let swept = false
  return async () => {
    if (swept) return
    swept = true
    await sweep()
  }
}

/**
 * Removes atomic-write orphans (`<prefix>.<uuid>.tmp`) from `dir`. Best effort.
 * Call it inside the file's queue slot so no write to that file is in flight.
 */
export async function sweepTmp(
  dir: string,
  prefix: string,
  remove: (path: string) => Promise<void> = unlink
): Promise<void> {
  const re = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${UUID_PATTERN}\\.tmp$`
  )
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
