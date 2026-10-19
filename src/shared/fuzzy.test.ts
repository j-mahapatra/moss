import { describe, expect, it } from 'vitest'
import { fuzzyMatch, rankItems, type PaletteItem } from './fuzzy'

type Row = {
  name: string
  query: string
  text: string
  score: number | null
  ranges?: [number, number][]
}

// Score: +1 per matched char, +5 at a word start, +3 when directly after the previous match.
const rows: Row[] = [
  { name: 'empty query', query: '', text: 'anything', score: 0, ranges: [] },
  { name: 'empty query, empty text', query: '', text: '', score: 0, ranges: [] },
  { name: 'no match', query: 'xyz', text: 'GET user', score: null },
  { name: 'query longer than text', query: 'users', text: 'user', score: null },
  { name: 'out of order is no match', query: 'gu', text: 'debug', score: null },
  {
    name: 'gu at two word starts',
    query: 'gu',
    text: 'GET user',
    score: 12,
    ranges: [
      [0, 1],
      [4, 5]
    ]
  },
  {
    name: 'gu mid-word then word start',
    query: 'gu',
    text: 'debug user',
    score: 7,
    ranges: [
      [4, 5],
      [6, 7]
    ]
  },
  { name: 'case-insensitive', query: 'GET', text: 'get', score: 14, ranges: [[0, 3]] },
  { name: 'contiguous ranges merge', query: 'use', text: 'user', score: 14, ranges: [[0, 3]] },
  {
    name: 'prefers a later word start over an earlier mid-word char',
    query: 'u',
    text: 'bug /users',
    score: 6,
    ranges: [[5, 6]]
  },
  {
    name: 'look-ahead: skips a mid-word letter when a later word start completes the match',
    query: 'ab',
    text: 'xa a-b',
    // a@1 is mid-word (a@1 + b@5 = 7); a@3 and b@5 are both word starts (12).
    score: 12,
    ranges: [
      [3, 4],
      [5, 6]
    ]
  },
  {
    name: 'word starts after / - _ . { :',
    query: 'abcdef',
    text: '/a-b_c.d{e:f',
    score: 36,
    ranges: [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12]
    ]
  },
  {
    name: 'contiguous mid-word run earns the adjacency bonus',
    query: 'ser',
    text: 'users',
    score: 1 + 4 + 4,
    ranges: [[1, 4]]
  },
  {
    name: 'unicode: case-folds accented letters',
    query: 'éc',
    text: 'École',
    score: 10,
    ranges: [[0, 2]]
  },
  {
    name: 'unicode: ranges are UTF-16 offsets past astral chars',
    query: 'ok',
    text: '🌿 ok',
    score: 10,
    ranges: [[3, 5]]
  }
]

describe('fuzzyMatch', () => {
  it.each(rows)('$name', ({ query, text, score, ranges }) => {
    const result = fuzzyMatch(query, text)
    if (score === null) {
      expect(result).toBeNull()
      return
    }
    expect(result).not.toBeNull()
    expect(result?.score).toBe(score)
    if (ranges !== undefined) expect(result?.ranges).toEqual(ranges)
  })

  it('scores gu in "GET user" above any match in "debug"', () => {
    const strong = fuzzyMatch('gu', 'GET user')?.score ?? 0
    expect(strong).toBeGreaterThan(fuzzyMatch('gu', 'debug')?.score ?? 0)
    expect(strong).toBeGreaterThan(fuzzyMatch('gu', 'debug user')?.score ?? 0)
  })

  it('scores a word-start match above a mid-word one', () => {
    const start = fuzzyMatch('t', 'token')?.score ?? 0
    const mid = fuzzyMatch('t', 'auth')?.score ?? 0
    expect(start).toBeGreaterThan(mid)
    expect(mid).toBe(1)
  })
})

function item(label: string, detail?: string, group = 'Requests'): PaletteItem {
  return { id: label, label, group, run: () => {}, ...(detail === undefined ? {} : { detail }) }
}

describe('rankItems', () => {
  it('orders by score, best first, and drops non-matches', () => {
    const items = [item('debug user'), item('Settings'), item('GET user')]
    expect(rankItems('gu', items).map((i) => i.label)).toEqual(['GET user', 'debug user'])
  })

  it('weights detail matches at half the label score', () => {
    // 'list' scores 18 on either string; via detail it counts half (9).
    const viaDetail = item('Token', 'Users/List')
    const viaLabel = item('List users')
    expect(rankItems('list', [viaDetail, viaLabel]).map((i) => i.label)).toEqual([
      'List users',
      'Token'
    ])
  })

  it('uses the better of label and half the detail score', () => {
    const a = item('zzz', 'Auth')
    expect(rankItems('auth', [a])).toEqual([a])
  })

  it('breaks ties by label, case-insensitively', () => {
    const items = [item('beta'), item('Alpha'), item('alpha two')]
    // Empty query: every item scores 0.
    expect(rankItems('', items).map((i) => i.label)).toEqual(['Alpha', 'alpha two', 'beta'])
  })

  it('respects the limit', () => {
    const items = Array.from({ length: 80 }, (_, i) => item(`req ${String(i).padStart(2, '0')}`))
    expect(rankItems('req', items)).toHaveLength(50)
    expect(rankItems('req', items, 3).map((i) => i.label)).toEqual(['req 00', 'req 01', 'req 02'])
  })
})
