import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { newRequestSpec } from '../../src/shared/types'

/** Writes `count` schema-valid history lines (oldest first) to `path`. */
export async function writeHistoryFile(path: string, count: number): Promise<void> {
  const base = Date.now() - count * 1000
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    lines.push(
      JSON.stringify({
        id: randomUUID(),
        at: new Date(base + i * 1000).toISOString(),
        request: { ...newRequestSpec(), url: `http://127.0.0.1:9/seed-${i}` },
        status: 200,
        durationMs: 1
      })
    )
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, lines.join('\n') + '\n', 'utf8')
}
