/** One entry the command palette can show and run. */
export type PaletteItem = {
  id: string
  label: string
  detail?: string
  group: string
  hint?: string
  badge?: string
  run(): void
}

export type FuzzyMatch = {
  score: number
  /** Merged half-open `[start, end)` spans of matched UTF-16 offsets in the text. */
  ranges: [start: number, end: number][]
}

const MATCH = 1
const WORD_START = 5
const ADJACENT = 3
const WORD_SEPARATORS = new Set([' ', '/', '-', '_', '.', '{', ':'])

type Char = { folded: string; offset: number; length: number; wordStart: boolean }

function chars(text: string): Char[] {
  const out: Char[] = []
  let offset = 0
  let previous: string | undefined
  for (const ch of text) {
    out.push({
      folded: ch.toLowerCase(),
      offset,
      length: ch.length,
      wordStart: previous === undefined || WORD_SEPARATORS.has(previous)
    })
    offset += ch.length
    previous = ch
  }
  return out
}

/**
 * Case-insensitive subsequence match of `query` in `text`, by code point.
 *
 * Each matched char scores +1, +5 more at a word start (index 0 or after a space or one of
 * `/ - _ . { :`) and +3 more when it directly follows the previous match. Among all
 * subsequence placements the highest-scoring one wins, so a later word start is preferred
 * over an earlier mid-word char whenever it can still complete the match. Equal scores are
 * broken deterministically: a contiguous step first, otherwise the leftmost position.
 * O(query × text).
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = Array.from(query, (ch) => ch.toLowerCase())
  if (q.length === 0) return { score: 0, ranges: [] }
  const t = chars(text)
  const m = q.length
  const n = t.length
  if (m > n) return null

  // best[i][j]: top score with q[0..i] matched and q[i] placed at t[j]; -Infinity if impossible.
  // from[i][j]: where q[i - 1] sits in that placement.
  const best: number[][] = []
  const from: number[][] = []
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(n).fill(-Infinity)
    const back = new Array<number>(n).fill(-1)
    const prevRow = best[i - 1]
    // Running max of prevRow[0..j-2], with the leftmost index on ties.
    let gapScore = -Infinity
    let gapAt = -1
    for (let j = i; j < n; j++) {
      if (prevRow !== undefined && j >= 2) {
        const candidate = prevRow[j - 2] ?? -Infinity
        if (candidate > gapScore) {
          gapScore = candidate
          gapAt = j - 2
        }
      }
      const c = t[j] as Char
      if (c.folded !== q[i]) continue
      const own = MATCH + (c.wordStart ? WORD_START : 0)
      if (prevRow === undefined) {
        row[j] = own
        continue
      }
      const adjacent = (prevRow[j - 1] ?? -Infinity) + ADJACENT
      if (adjacent >= gapScore && adjacent > -Infinity) {
        row[j] = own + adjacent
        back[j] = j - 1
      } else if (gapScore > -Infinity) {
        row[j] = own + gapScore
        back[j] = gapAt
      }
    }
    best.push(row)
    from.push(back)
  }

  const last = best[m - 1] as number[]
  let end = -1
  let score = -Infinity
  for (let j = 0; j < n; j++) {
    const s = last[j] as number
    if (s > score) {
      score = s
      end = j
    }
  }
  if (end < 0) return null

  const positions: number[] = []
  for (let i = m - 1, j = end; i >= 0; i--) {
    positions.push(j)
    j = (from[i] as number[])[j] as number
  }
  positions.reverse()

  const ranges: [number, number][] = []
  for (const p of positions) {
    const c = t[p] as Char
    const tail = ranges[ranges.length - 1]
    if (tail !== undefined && tail[1] === c.offset) tail[1] = c.offset + c.length
    else ranges.push([c.offset, c.offset + c.length])
  }
  return { score, ranges }
}

/**
 * Items matching `query`, best first. An item scores the better of its label match and half
 * its detail match; items matching neither are dropped. Ties sort by label.
 */
export function rankItems(query: string, items: PaletteItem[], limit = 50): PaletteItem[] {
  const scored: { item: PaletteItem; score: number }[] = []
  for (const item of items) {
    const label = fuzzyMatch(query, item.label)
    const detail = item.detail === undefined ? null : fuzzyMatch(query, item.detail)
    if (label === null && detail === null) continue
    scored.push({
      item,
      score: Math.max(label?.score ?? -Infinity, detail === null ? -Infinity : 0.5 * detail.score)
    })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.label.localeCompare(b.item.label, undefined, { sensitivity: 'base' })
  )
  return scored.slice(0, limit).map((s) => s.item)
}
