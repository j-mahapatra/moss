import { randomUUID } from 'crypto'
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname } from 'path'

export type AtomicFs = {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  unlink: (path: string) => Promise<void>
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  appendFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
}

export const defaultFs: AtomicFs = { mkdir, writeFile, rename, unlink, readFile, appendFile }

/** Writes JSON to a temp file beside `path`, then renames it into place. */
export function atomicWriteJson(
  path: string,
  data: unknown,
  fsImpl: AtomicFs = defaultFs
): Promise<void> {
  return atomicWriteText(path, JSON.stringify(data, null, 2) + '\n', fsImpl)
}

/** Writes text to a temp file beside `path`, then renames it into place. */
export async function atomicWriteText(
  path: string,
  text: string,
  fsImpl: AtomicFs = defaultFs
): Promise<void> {
  await fsImpl.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    await fsImpl.writeFile(tmp, text, 'utf8')
    await fsImpl.rename(tmp, path)
  } catch (err) {
    try {
      await fsImpl.unlink(tmp)
    } catch (cleanupErr) {
      if ((cleanupErr as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupErr
    }
    throw err
  }
}

/** Serializes tasks per key; a failed task does not block later ones. */
export class WriteQueue {
  private tails = new Map<string, Promise<unknown>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const result = prev.then(task, task)
    const tail = result.catch(() => undefined)
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return result
  }

  /** Resolves once no key has pending work. Work enqueued while waiting is awaited too. */
  async idle(): Promise<void> {
    while (this.tails.size > 0) await Promise.all([...this.tails.values()])
  }
}
