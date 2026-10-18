import { readdir } from 'fs/promises'
import { join } from 'path'
import type { z } from 'zod'
import { defaultFs, WriteQueue, type AtomicFs } from './atomic-write'

export type DirReadResult<T> = { values: T[]; warnings: string[] }

const NAME_RE = /^[0-9a-f-]{36}\.json$/i

export function quarantineName(file: string, ts: number): string {
  return `${file.replace(/\.json$/i, '')}.corrupt-${ts}.json`
}

/** Moves a bad file aside and returns the user-facing warning. Never throws. */
export async function quarantine(
  dir: string,
  file: string,
  ts: number,
  fsImpl: AtomicFs = defaultFs
): Promise<string> {
  const newName = quarantineName(file, ts)
  try {
    await fsImpl.rename(join(dir, file), join(dir, newName))
    return `Couldn't read "${file}". It was moved aside as "${newName}".`
  } catch {
    return `Couldn't read "${file}". It was left in place.`
  }
}

export async function readJsonDir<T extends { id: string }>(
  dir: string,
  schema: z.ZodType<T>,
  now: () => number = Date.now,
  queue: WriteQueue = new WriteQueue(),
  fsImpl: AtomicFs = defaultFs
): Promise<DirReadResult<T>> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { values: [], warnings: [] }
    throw err
  }
  const values: T[] = []
  const warnings: string[] = []
  for (const file of names.filter((n) => NAME_RE.test(n)).sort()) {
    // Read + quarantine happen under the file's queue key so a concurrent save/delete can't interleave.
    await queue.run(join(dir, file), async () => {
      let parsed: T | null = null
      try {
        const raw = await fsImpl.readFile(join(dir, file), 'utf8')
        const r = schema.safeParse(JSON.parse(raw))
        if (r.success && `${r.data.id}.json`.toLowerCase() === file.toLowerCase()) parsed = r.data
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      }
      if (parsed) values.push(parsed)
      else warnings.push(await quarantine(dir, file, now(), fsImpl))
    })
  }
  return { values, warnings }
}
