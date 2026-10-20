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

/** Case folds that `toLowerCase` gets wrong for matching: dotted capital I and the sharp s. */
const FOLD: Record<string, string> = { İ: 'i', ß: 'ss', ẞ: 'ss' }

/** NFC, then lowercase with the FOLD exceptions, as an array of code points. */
function fold(text: string): string[] {
  return Array.from(text.normalize('NFC'), (ch) => FOLD[ch] ?? ch.toLowerCase()).flatMap((f) =>
    Array.from(f)
  )
}

/**
 * One matchable unit of the text: a code point with any combining marks after it. `folded` is
 * usually one code point, but can be more (ß → s s); a match consumes all of it at once.
 */
type Unit = { folded: string[]; offset: number; length: number; wordStart: boolean }

const COMBINING = /\p{M}/u

function units(text: string): Unit[] {
  const out: Unit[] = []
  let offset = 0
  let previous: string | undefined
  let unit = ''
  const flush = (): void => {
    if (unit === '') return
    out.push({
      folded: fold(unit),
      offset,
      length: unit.length,
      wordStart: previous === undefined || WORD_SEPARATORS.has(previous)
    })
    offset += unit.length
    previous = Array.from(unit).pop()
    unit = ''
  }
  for (const ch of text) {
    if (unit !== '' && COMBINING.test(ch)) unit += ch
    else {
      flush()
      unit = ch
    }
  }
  flush()
  return out
}

/** Whether `unit` folds to exactly `q[end - unit.length + 1 .. end]`. */
function matchesAt(unit: Unit, q: string[], end: number): boolean {
  const start = end - unit.folded.length + 1
  if (start < 0) return false
  return unit.folded.every((ch, k) => q[start + k] === ch)
}

/** Cheap necessary condition: `q` is a subsequence of the text's folded code points. */
function maySubsequence(q: string[], t: Unit[]): boolean {
  let k = 0
  for (const unit of t) {
    for (const ch of unit.folded) {
      if (ch === q[k]) k++
      if (k === q.length) return true
    }
  }
  return false
}

/**
 * Case-insensitive subsequence match of `query` in `text`, by code point. Both sides are folded
 * with NFC and lowercase, `İ` → `i` and `ß` → `ss`; a text `ß` is then matched by two query
 * chars, and its range covers the one code point. A combining mark goes with the char before it.
 *
 * Each matched query char scores +1, +5 more at a word start (index 0 or after a space or one
 * of `/ - _ . { :`) and +3 more when it directly follows the previous match. Among all
 * subsequence placements the highest-scoring one wins, so a later word start is preferred
 * over an earlier mid-word char whenever it can still complete the match. Equal scores are
 * broken deterministically: a contiguous step first, otherwise the leftmost position.
 * O(query × text), after a linear scan that rejects most non-matches.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = fold(query)
  if (q.length === 0) return { score: 0, ranges: [] }
  const t = units(text)
  const m = q.length
  const n = t.length
  if (!maySubsequence(q, t)) return null

  // best[i][j]: top score with q[0..i] matched and the last unit placed at t[j]; -Infinity if
  // impossible. from[i][j]: where the previous unit sits in that placement. topScore[i][j] and
  // topAt[i][j]: the max of best[i][0..j] and its leftmost index, for the gap step.
  const best: number[][] = []
  const from: number[][] = []
  const topScore: number[][] = []
  const topAt: number[][] = []
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(n).fill(-Infinity)
    const back = new Array<number>(n).fill(-1)
    for (let j = 0; j < n; j++) {
      const c = t[j] as Unit
      if (!matchesAt(c, q, i)) continue
      const own = MATCH * c.folded.length + (c.wordStart ? WORD_START : 0)
      const r = i - c.folded.length
      if (r < 0) {
        row[j] = own
        continue
      }
      const prevRow = best[r] as number[]
      const gapScore = j >= 2 ? ((topScore[r] as number[])[j - 2] as number) : -Infinity
      const adjacent = (prevRow[j - 1] ?? -Infinity) + ADJACENT
      if (adjacent >= gapScore && adjacent > -Infinity) {
        row[j] = own + adjacent
        back[j] = j - 1
      } else if (gapScore > -Infinity) {
        row[j] = own + gapScore
        back[j] = (topAt[r] as number[])[j - 2] as number
      }
    }
    const scores = new Array<number>(n)
    const ats = new Array<number>(n)
    let score = -Infinity
    let at = -1
    for (let j = 0; j < n; j++) {
      const s = row[j] as number
      if (s > score) {
        score = s
        at = j
      }
      scores[j] = score
      ats[j] = at
    }
    best.push(row)
    from.push(back)
    topScore.push(scores)
    topAt.push(ats)
  }

  const score = (topScore[m - 1] as number[])[n - 1] ?? -Infinity
  const end = (topAt[m - 1] as number[])[n - 1] ?? -1
  if (end < 0) return null

  const positions: number[] = []
  for (let i = m - 1, j = end; i >= 0;) {
    positions.push(j)
    const prev = (from[i] as number[])[j] as number
    i -= (t[j] as Unit).folded.length
    j = prev
  }
  positions.reverse()

  const ranges: [number, number][] = []
  for (const p of positions) {
    const c = t[p] as Unit
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
