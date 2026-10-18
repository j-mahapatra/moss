import { readdir, readFile, rename } from 'fs/promises'
import { join } from 'path'
import type { z } from 'zod'

export type DirReadResult<T> = { values: T[]; warnings: string[] }

const NAME_RE = /^[0-9a-f-]{36}\.json$/i

export function quarantineName(file: string, ts: number): string {
  return `${file.replace(/\.json$/i, '')}.corrupt-${ts}.json`
}

/** Moves a bad file aside and returns the user-facing warning. */
export async function quarantine(dir: string, file: string, ts: number): Promise<string> {
  const newName = quarantineName(file, ts)
  await rename(join(dir, file), join(dir, newName))
  return `Couldn't read "${file}". It was moved aside as "${newName}".`
}

export async function readJsonDir<T extends { id: string }>(
  dir: string,
  schema: z.ZodType<T>,
  now: () => number = Date.now
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
    let parsed: T | null = null
    try {
      const r = schema.safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')))
      if (r.success && `${r.data.id}.json`.toLowerCase() === file.toLowerCase()) parsed = r.data
    } catch {
      parsed = null
    }
    if (parsed) values.push(parsed)
    else warnings.push(await quarantine(dir, file, now()))
  }
  return { values, warnings }
}
