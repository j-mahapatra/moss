import { describe, expect, it } from 'vitest'
import { HISTORY_CAP, filterHistory, groupByDay, statusLabel } from './history'
import { newRequestSpec } from './types'
import type { HistoryEntry } from './types'

function entry(
  at: Date,
  over: Partial<HistoryEntry> = {},
  name = 'Req',
  url = 'https://x.test/a',
  method: 'GET' | 'POST' = 'GET'
): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    at: at.toISOString(),
    request: { ...newRequestSpec(), name, url, method },
    status: 200,
    durationMs: 5,
    ...over
  }
}

describe('HISTORY_CAP', () => {
  it('is 500', () => expect(HISTORY_CAP).toBe(500))
})

describe('groupByDay', () => {
  const now = new Date(2026, 9, 19, 12, 0)

  it('groups today, yesterday and older days newest-first', () => {
    const a = entry(new Date(2026, 9, 19, 9, 0))
    const b = entry(new Date(2026, 9, 18, 23, 0))
    const c = entry(new Date(2026, 9, 16, 8, 0))
    const groups = groupByDay([a, b, c], now, 'en-US')
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Friday, Oct 16'])
    expect(groups.map((g) => g.key)).toEqual(['2026-10-19', '2026-10-18', '2026-10-16'])
  })

  it('keeps order within a group', () => {
    const a = entry(new Date(2026, 9, 19, 11, 0))
    const b = entry(new Date(2026, 9, 19, 9, 0))
    const groups = groupByDay([a, b], now, 'en-US')
    expect(groups).toHaveLength(1)
    expect(groups[0]?.entries).toEqual([a, b])
  })

  it('includes the year for a different year', () => {
    const groups = groupByDay([entry(new Date(2025, 11, 25, 9, 0))], now, 'en-US')
    expect(groups[0]?.label).toContain('2025')
  })

  it('puts 23:59 local on its own day', () => {
    const late = entry(new Date(2026, 9, 18, 23, 59))
    const early = entry(new Date(2026, 9, 19, 0, 1))
    const groups = groupByDay([early, late], now, 'en-US')
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
  })

  it('returns [] for no entries', () => {
    expect(groupByDay([], now)).toEqual([])
  })
})

describe('filterHistory', () => {
  const list = [
    entry(new Date(2026, 9, 19), {}, 'List users', 'https://api.test/users', 'POST'),
    entry(new Date(2026, 9, 19), {}, 'Health', 'https://api.test/health')
  ]

  it('matches method, url and name case-insensitively', () => {
    expect(filterHistory(list, 'post')).toEqual([list[0]])
    expect(filterHistory(list, 'HEALTH')).toEqual([list[1]])
    expect(filterHistory(list, ' /users ')).toEqual([list[0]])
    expect(filterHistory(list, 'list')).toEqual([list[0]])
    expect(filterHistory(list, 'zzz')).toEqual([])
  })

  it('returns the same reference for an empty query', () => {
    expect(filterHistory(list, '')).toBe(list)
    expect(filterHistory(list, '   ')).toBe(list)
  })
})

describe('statusLabel', () => {
  const at = new Date(2026, 9, 19)
  it('maps status families', () => {
    expect(statusLabel(entry(at, { status: 404 }))).toEqual({ text: '404', tone: '4xx' })
    expect(statusLabel(entry(at, { status: 200 })).tone).toBe('2xx')
    expect(statusLabel(entry(at, { status: 301 })).tone).toBe('3xx')
    expect(statusLabel(entry(at, { status: 503 })).tone).toBe('5xx')
    expect(statusLabel(entry(at, { status: 101 })).tone).toBe('neutral')
    expect(statusLabel(entry(at, { status: 999 })).tone).toBe('neutral')
  })
  it('maps errors', () => {
    expect(statusLabel(entry(at, { status: null, errorKind: 'aborted' }))).toEqual({
      text: 'Cancelled',
      tone: 'neutral'
    })
    expect(statusLabel(entry(at, { status: null, errorKind: 'dns' }))).toEqual({
      text: 'Error',
      tone: 'danger'
    })
  })
})
