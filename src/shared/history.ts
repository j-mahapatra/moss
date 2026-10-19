import type { HistoryEntry } from './types'

export const HISTORY_CAP = 500

export type HistoryGroup = { key: string; label: string; entries: HistoryEntry[] }

const pad = (n: number): string => String(n).padStart(2, '0')

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function groupByDay(entries: HistoryEntry[], now: Date, locale?: string): HistoryGroup[] {
  const todayKey = dayKey(now)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterdayKey = dayKey(yesterday)
  const groups: HistoryGroup[] = []
  const byKey = new Map<string, HistoryGroup>()
  for (const entry of entries) {
    const d = new Date(entry.at)
    const key = dayKey(d)
    let group = byKey.get(key)
    if (!group) {
      let label: string
      if (key === todayKey) label = 'Today'
      else if (key === yesterdayKey) label = 'Yesterday'
      else {
        label = new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {})
        }).format(d)
      }
      group = { key, label, entries: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

export function filterHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return entries
  return entries.filter((e) =>
    `${e.request.method} ${e.request.url} ${e.request.name}`.toLowerCase().includes(q)
  )
}

export type StatusTone = '2xx' | '3xx' | '4xx' | '5xx' | 'neutral' | 'danger'

export function statusLabel(e: HistoryEntry): { text: string; tone: StatusTone } {
  if (e.status === null) {
    return e.errorKind === 'aborted'
      ? { text: 'Cancelled', tone: 'neutral' }
      : { text: 'Error', tone: 'danger' }
  }
  const s = e.status
  const tone: StatusTone =
    s >= 200 && s < 300
      ? '2xx'
      : s >= 300 && s < 400
        ? '3xx'
        : s >= 400 && s < 500
          ? '4xx'
          : s >= 500 && s < 600
            ? '5xx'
            : 'neutral'
  return { text: `${s}`, tone }
}
