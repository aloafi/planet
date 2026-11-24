import { dayLogOf, hasProgress, todayKey } from './engine'
import type { AppState, DayLog } from './types'

export interface Stats {
  days: DayLog[]
  focusMs: number
  breakMs: number
  savedMs: number
  tasksDone: number
  tasksPlanned: number
  skipped: number
  activeDays: number
  avgFocusMs: number
  bestDay: { date: string; ms: number } | null
  longestTask: { name: string; ms: number } | null
  firstDate: string | null
  week: { date: string; ms: number; today: boolean }[]
  topTasks: { name: string; ms: number; count: number }[]
}

/** Everything since the first day: finished days from history plus today's run in progress. */
export function statsOf(s: AppState, now: number): Stats {
  const days = [...s.history]
  if (hasProgress(s.run) && !days.some((d) => d.id === s.run.id)) days.unshift(dayLogOf(s, now))
  // one entry per calendar day (several runs on one date add up)
  const byDate = new Map<string, number>()
  let focusMs = 0
  let breakMs = 0
  let savedMs = 0
  let tasksDone = 0
  let tasksPlanned = 0
  let skipped = 0
  let longestTask: Stats['longestTask'] = null
  const perTask = new Map<string, { name: string; ms: number; count: number }>()
  for (const d of days) {
    focusMs += d.focusedMs
    breakMs += d.breakMs
    savedMs += d.bankMs
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.focusedMs)
    for (const b of d.blocks) {
      if (b.type !== 'task') continue
      tasksPlanned++
      if (b.status === 'completed') tasksDone++
      if (b.status === 'skipped') skipped++
      if (b.spentMs > 0) {
        const key = b.name.trim().toLowerCase()
        const cur = perTask.get(key) ?? { name: b.name.trim(), ms: 0, count: 0 }
        cur.ms += b.spentMs
        if (b.status === 'completed') cur.count++
        perTask.set(key, cur)
        if (!longestTask || b.spentMs > longestTask.ms) longestTask = { name: b.name, ms: b.spentMs }
      }
    }
  }
  const dated = [...byDate.entries()].filter(([, ms]) => ms > 0)
  const activeDays = dated.length
  const bestDay = dated.reduce<Stats['bestDay']>((best, [date, ms]) => (!best || ms > best.ms ? { date, ms } : best), null)
  const firstDate = days.length ? days.map((d) => d.date).sort()[0] : null

  const week: Stats['week'] = []
  const today = todayKey(now)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = todayKey(d.getTime())
    week.push({ date: key, ms: byDate.get(key) ?? 0, today: key === today })
  }

  return {
    days,
    focusMs,
    breakMs,
    savedMs,
    tasksDone,
    tasksPlanned,
    skipped,
    activeDays,
    avgFocusMs: activeDays ? focusMs / activeDays : 0,
    bestDay,
    longestTask,
    firstDate,
    week,
    topTasks: [...perTask.values()].sort((a, b) => b.ms - a.ms).slice(0, 6),
  }
}

/** split a duration into hours, minutes and seconds */
export function hms(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}
