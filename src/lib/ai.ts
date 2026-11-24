import { daysUntil, eventOf, summaryOf, tasksOf } from './engine'
import type { AppState, DayLog, Forecast, Recap } from './types'
import { t } from './i18n'

const MIN = 60_000
/** Supabase Edge Function that holds the Anthropic key (see supabase/functions/planet-ai) */
const ENDPOINT = 'https://lsvzudrcmjxeerarfevw.supabase.co/functions/v1/planet-ai'
const mins = (ms: number) => Math.round(ms / MIN)

export class AIError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export function aiErrorText(e: unknown) {
  const code = e instanceof AIError ? e.code : 'network'
  switch (code) {
    case 'no_key':
      return t('aiNoKey')
    case 'bad_key':
      return t('aiBadKey')
    case 'rate':
      return t('aiRate')
    default:
      return t('aiDown')
  }
}

async function ask<T>(mode: 'forecast' | 'recap', payload: unknown, lang: string): Promise<T> {
  let r: Response
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, payload, lang }),
    })
  } catch {
    throw new AIError('network')
  }
  let data: unknown = null
  try {
    data = await r.json()
  } catch {
    /* non-JSON (e.g. no function in local dev) */
  }
  if (!r.ok || !data || typeof data !== 'object') throw new AIError((data as { error?: string } | null)?.error || 'upstream')
  return data as T
}

const eventInfo = (s: AppState, now: number, id?: string | null) => {
  const ev = eventOf(s, id)
  return ev ? { name: ev.name, date: ev.date, daysLeft: daysUntil(ev.date, now) } : null
}

export async function forecastPlan(s: AppState, now: number, key: string): Promise<Forecast> {
  const tasks = tasksOf(s.plan)
  const recent = s.history
    .filter((h) => !s.plan.eventId || h.eventId === s.plan.eventId)
    .slice(0, 5)
    .map((h) => ({
      date: h.date,
      completed: h.blocks.filter((b) => b.type === 'task' && b.status === 'completed').map((b) => b.name),
      skipped: h.blocks.filter((b) => b.type === 'task' && b.status === 'skipped').map((b) => b.name),
      focusMin: mins(h.focusedMs),
    }))
  const payload = {
    today: new Date(now).toDateString(),
    event: eventInfo(s, now, s.plan.eventId),
    startsAt: s.plan.startTime,
    blocks: s.plan.blocks.map((b) => ({
      type: b.type,
      name: b.name || (b.type === 'break' ? t('break') : t('untitled')),
      minutes: b.duration,
      ...(b.type === 'task' && !b.timed ? { untimed: true } : {}),
      ...(b.description ? { note: b.description } : {}),
    })),
    totals: {
      tasks: tasks.length,
      focusMin: tasks.reduce((a, b) => a + b.duration, 0),
      breakMin: s.plan.blocks.filter((b) => b.type === 'break').reduce((a, b) => a + b.duration, 0),
    },
    recentDays: recent,
  }
  const r = await ask<Omit<Forecast, 'key' | 'at'>>('forecast', payload, s.settings.lang)
  return { ...r, key, at: Date.now() }
}

export async function recapDay(s: AppState, now: number, log?: DayLog): Promise<Recap> {
  const sum = summaryOf(s, now)
  const blocks = log?.blocks
  const payload = {
    date: new Date(now).toDateString(),
    event: eventInfo(s, now, log?.eventId ?? s.plan.eventId),
    endedEarly: s.run.endedEarly,
    tasks: (blocks ?? [])
      .filter((b) => b.type === 'task')
      .map((b) => ({ name: b.name, status: b.status === 'pending' ? 'unfinished' : b.status, plannedMin: b.plannedMin, actualMin: mins(b.spentMs) })),
    breaks: {
      count: (blocks ?? []).filter((b) => b.type === 'break' && b.status === 'completed').length,
      minutes: mins(sum.breakMs),
    },
    focusMin: mins(sum.focusedMs),
    timeSavedMin: mins(sum.bankMs),
    completed: sum.completed,
    totalTasks: sum.total,
  }
  const r = await ask<Omit<Recap, 'at'>>('recap', payload, s.settings.lang)
  return { ...r, at: Date.now() }
}
