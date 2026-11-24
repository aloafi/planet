import { isAr, t } from './i18n'
import type { AppState, Block, BlockRecord, DayLog, Forecast, Plan, PlanEvent, Recap, Run, Settings, Timer } from './types'

export const MIN = 60_000

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export const todayKey = (now: number) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const freshTimer = (now: number | null, running: boolean): Timer => ({
  status: running ? 'running' : 'ready',
  startedAt: running ? now : null,
  elapsedMs: 0,
  extendMs: 0,
  alerted: false,
  overtimeAck: false,
})

export const freshRun = (now: number): Run => ({
  id: uid(),
  date: todayKey(now),
  phase: 'idle',
  currentId: null,
  records: {},
  timer: freshTimer(null, false),
  startedAt: null,
  endedAt: null,
  endedEarly: false,
  recap: null,
})

export const defaultSettings: Settings = {
  autoStartNext: true,
  breakEnd: 'auto',
  taskEnd: 'ask',
  sound: true,
  notify: false,
  wakeLock: true,
  theme: 'dark',
  motion: true,
  ai: true,
  lang: 'en',
}

export const sampleBlocks = (): Block[] =>
  isAr()
    ? [
        { id: uid(), type: 'task', name: 'الرياضيات', description: 'الفصل الرابع — تمارين المجموعة ب', duration: 45, timed: true },
        { id: uid(), type: 'break', name: 'استراحة', description: '', duration: 10, timed: true },
        { id: uid(), type: 'task', name: 'الفيزياء', description: 'مراجعة معادلات الحركة', duration: 50, timed: true },
        { id: uid(), type: 'break', name: 'استراحة', description: '', duration: 15, timed: true },
        { id: uid(), type: 'task', name: 'اللغة الإنجليزية', description: 'مسودة المقال، أول فقرتين', duration: 40, timed: true },
      ]
    : [
  { id: uid(), type: 'task', name: 'Mathematics', description: 'Chapter 4 — practice set B', duration: 45, timed: true },
  { id: uid(), type: 'break', name: 'Break', description: '', duration: 10, timed: true },
  { id: uid(), type: 'task', name: 'Physics', description: 'Review motion equations', duration: 50, timed: true },
  { id: uid(), type: 'break', name: 'Break', description: '', duration: 15, timed: true },
  { id: uid(), type: 'task', name: 'English', description: 'Essay draft, first two paragraphs', duration: 40, timed: true },
      ]

export const initialState = (now: number): AppState => ({
  version: 1,
  plan: { startTime: '08:00', blocks: [] },
  templates: [],
  run: freshRun(now),
  settings: defaultSettings,
  events: [],
  history: [],
  forecast: null,
})

/* ---------- selectors ---------- */

export const elapsedOf = (t: Timer, now: number) =>
  t.elapsedMs + (t.status === 'running' && t.startedAt != null ? Math.max(0, now - t.startedAt) : 0)

export const totalMsOf = (b: Block, t: Timer) => b.duration * MIN + t.extendMs

export const isCountdown = (b: Block) => b.type === 'break' || (b.type === 'task' && b.timed)
export const isSession = (b: Block) => b.type === 'session'

/** ms left on the countdown (negative = overtime). null for untimed tasks. */
export const remainingOf = (b: Block, t: Timer, now: number) =>
  isCountdown(b) ? totalMsOf(b, t) - elapsedOf(t, now) : null

/** epoch ms at which the running countdown hits zero */
export const expiryAt = (b: Block, t: Timer) =>
  t.status === 'running' && t.startedAt != null && isCountdown(b)
    ? t.startedAt + (totalMsOf(b, t) - t.elapsedMs)
    : null

export const statusOf = (run: Run, id: string) => run.records[id]?.status ?? 'pending'

export const currentBlock = (s: AppState) =>
  s.run.currentId ? s.plan.blocks.find((b) => b.id === s.run.currentId) ?? null : null

export const nextPending = (plan: Plan, run: Run, excludeId: string | null) =>
  plan.blocks.find((b) => b.type !== 'session' && b.id !== excludeId && statusOf(run, b.id) === 'pending') ?? null

/* ---------- sessions ---------- */

export const sessionsOf = (plan: Plan) => plan.blocks.filter(isSession)

/** the session divider a block sits under (null when the plan has no session above it) */
export const sessionOf = (plan: Plan, id: string | null | undefined) => {
  if (!id) return null
  let cur: Block | null = null
  for (const b of plan.blocks) {
    if (b.type === 'session') cur = b
    if (b.id === id) return b.type === 'session' ? b : cur
  }
  return null
}

/** 1-based number of a session */
export const sessionNumber = (plan: Plan, sessionId: string) => sessionsOf(plan).findIndex((b) => b.id === sessionId) + 1

/** the work blocks inside a session */
export const sessionBlocks = (plan: Plan, sessionId: string) => {
  const out: Block[] = []
  let inside = false
  for (const b of plan.blocks) {
    if (b.type === 'session') inside = b.id === sessionId
    else if (inside) out.push(b)
  }
  return out
}

export const tasksOf = (plan: Plan) => plan.blocks.filter((b) => b.type === 'task')

export const progressOf = (s: AppState) => {
  const tasks = tasksOf(s.plan)
  const handled = tasks.filter((b) => statusOf(s.run, b.id) !== 'pending').length
  const completed = tasks.filter((b) => statusOf(s.run, b.id) === 'completed').length
  return { total: tasks.length, handled, completed, ratio: tasks.length ? handled / tasks.length : 0 }
}

/** 1-based position of a task among tasks only */
export const taskNumber = (plan: Plan, id: string) => {
  const i = tasksOf(plan).findIndex((b) => b.id === id)
  return i === -1 ? null : i + 1
}

export const parseHM = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Planned start minute (from midnight) of each block. Untimed tasks still use their duration as an estimate. */
export const scheduleOf = (plan: Plan) => {
  let t = parseHM(plan.startTime)
  return plan.blocks.map((b) => {
    const start = t
    t += b.duration
    return { block: b, start, end: t }
  })
}

/**
 * Time bank: how far ahead (+) or behind (−) the plan you are.
 * Each completed countdown block adds (planned − actual); a block running
 * over its planned time eats into the bank live. Skipped and untimed blocks don't count,
 * nor do blocks marked done in under a minute (finished off the clock).
 */
export const bankOf = (s: AppState, now: number, onlySession?: string) => {
  let ms = 0
  let counted = 0
  const scope = onlySession ? new Set(sessionBlocks(s.plan, onlySession).map((b) => b.id)) : null
  for (const b of s.plan.blocks) {
    if (!isCountdown(b) || (scope && !scope.has(b.id))) continue
    const r = s.run.records[b.id]
    if (b.bonus) {
      // a break taken from saved time uses that time up
      if (r && r.spentMs > 0) {
        ms -= r.spentMs
        counted++
      }
      continue
    }
    // a block marked done within its first minute was done off the clock — it says nothing about speed
    if (r?.status === 'completed' && r.spentMs >= MIN) {
      ms += b.duration * MIN - r.spentMs
      counted++
    }
  }
  const cur = s.run.phase === 'active' ? currentBlock(s) : null
  if (cur && isCountdown(cur) && (!scope || scope.has(cur.id))) {
    const prior = s.run.records[cur.id]?.spentMs ?? 0
    const planned = cur.bonus ? 0 : cur.duration * MIN
    const over = prior + elapsedOf(s.run.timer, now) - planned
    if (over > 0) {
      ms -= over
      counted++
    }
  }
  return { ms, counted }
}

export const summaryOf = (s: AppState, now: number) => {
  const tasks = tasksOf(s.plan)
  let focusedMs = 0
  let breakMs = 0
  for (const b of s.plan.blocks) {
    let ms = s.run.records[b.id]?.spentMs ?? 0
    if (b.id === s.run.currentId && s.run.phase === 'active') ms += elapsedOf(s.run.timer, now)
    if (b.type === 'task') focusedMs += ms
    else breakMs += ms
  }
  const completed = tasks.filter((b) => statusOf(s.run, b.id) === 'completed')
  const skipped = tasks.filter((b) => statusOf(s.run, b.id) === 'skipped')
  const incomplete = tasks.filter((b) => statusOf(s.run, b.id) === 'pending')
  return {
    bankMs: bankOf(s, now).ms,
    total: tasks.length,
    completed: completed.length,
    focusedMs,
    breakMs,
    percent: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0,
    skipped,
    incomplete,
  }
}

/** whole days from today until an event date (negative = passed) */
export const daysUntil = (date: string, now: number) => {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, (m || 1) - 1, d || 1).getTime()
  const t = new Date(now)
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
}

export const eventOf = (s: AppState, id?: string | null) => (id ? s.events.find((e) => e.id === id) ?? null : null)

/** changes whenever the plan meaningfully changes — used to tell if a forecast is stale */
export const planKey = (s: AppState) =>
  JSON.stringify([s.plan.eventId ?? null, s.plan.startTime, s.plan.blocks.map((b) => [b.type, b.name, b.duration, b.timed])])

export const hasProgress = (run: Run) => Object.values(run.records).some((r) => r.status !== 'pending' || r.spentMs > 0)

/** snapshot of the current day for history / AI / sharing */
export function dayLogOf(s: AppState, now: number): DayLog {
  const sum = summaryOf(s, now)
  const ev = eventOf(s, s.plan.eventId)
  return {
    id: s.run.id,
    date: s.run.date,
    eventId: ev?.id ?? null,
    eventName: ev?.name ?? null,
    endedEarly: s.run.endedEarly,
    blocks: s.plan.blocks.filter((b) => b.type !== 'session').map((b) => {
      let spent = s.run.records[b.id]?.spentMs ?? 0
      if (b.id === s.run.currentId && s.run.phase === 'active') spent += elapsedOf(s.run.timer, now)
      return { name: b.name || (b.type === 'break' ? t('break') : t('untitled')), type: b.type, plannedMin: b.duration, spentMs: spent, status: statusOf(s.run, b.id) }
    }),
    focusedMs: sum.focusedMs,
    breakMs: sum.breakMs,
    bankMs: sum.bankMs,
    completed: sum.completed,
    total: sum.total,
    recap: s.run.recap ?? null,
  }
}

/** keep a record of a day that had any progress */
function archive(s: AppState, now: number): AppState {
  if (!hasProgress(s.run) || !s.plan.blocks.length) return s
  const log = dayLogOf(s, now)
  const history = [log, ...s.history.filter((h) => h.id !== log.id)].slice(0, 90)
  return { ...s, history }
}

/* ---------- actions ---------- */

export type Action =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'START_DAY'; now: number }
  | { type: 'START'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'FINISH'; now: number }
  | { type: 'SKIP'; now: number }
  | { type: 'EXTEND'; minutes: number; now: number }
  | { type: 'KEEP_GOING' }
  | { type: 'MARK_ALERTED' }
  | { type: 'TICK'; now: number }
  | { type: 'JUMP_TO'; id: string; now: number }
  | { type: 'END_DAY'; now: number }
  | { type: 'RESET_DAY'; now: number }
  | { type: 'ADD_BLOCK'; block: Block; index?: number }
  | { type: 'UPDATE_BLOCK'; id: string; patch: Partial<Block>; now: number }
  | { type: 'DELETE_BLOCK'; id: string; now: number }
  | { type: 'MOVE_BLOCK'; from: number; to: number }
  | { type: 'SET_START_TIME'; value: string }
  | { type: 'SET_BLOCKS'; blocks: Block[]; startTime?: string; now: number }
  | { type: 'SAVE_TEMPLATE'; name: string; now: number }
  | { type: 'LOAD_TEMPLATE'; id: string; now: number }
  | { type: 'DELETE_TEMPLATE'; id: string }
  | { type: 'SETTINGS'; patch: Partial<Settings> }
  | { type: 'ADD_EVENT'; event: PlanEvent; attach?: boolean }
  | { type: 'DELETE_EVENT'; id: string }
  | { type: 'SET_PLAN_EVENT'; id: string | null }
  | { type: 'SET_FORECAST'; forecast: Forecast | null }
  | { type: 'SET_RECAP'; recap: Recap | null; now: number }
  | { type: 'TAKE_BONUS_BREAK'; minutes: number; name: string; now: number }
  | { type: 'CONTINUE_SESSION'; now: number }

const rec = (run: Run, id: string): BlockRecord => run.records[id] ?? { status: 'pending', spentMs: 0 }

/** Close out the current block with a status, then move to the next pending one. */
function leaveCurrent(
  s: AppState,
  status: BlockRecord['status'],
  now: number,
  opts: { spentMs?: number; nextStartAt?: number; forceStart?: boolean } = {},
): AppState {
  const run = s.run
  const id = run.currentId
  if (!id) return s
  const spent = opts.spentMs ?? elapsedOf(run.timer, now)
  const r = rec(run, id)
  const records = { ...run.records, [id]: { status, spentMs: r.spentMs + spent, doneAt: opts.nextStartAt ?? now } }
  return advance({ ...s, run: { ...run, records } }, now, opts.nextStartAt, opts.forceStart, id)
}

function advance(s: AppState, now: number, startAt?: number, forceStart?: boolean, fromId?: string): AppState {
  const next = nextPending(s.plan, s.run, s.run.currentId)
  if (!next) {
    return { ...s, run: { ...s.run, phase: 'done', currentId: null, gate: null, endedAt: startAt ?? now, timer: freshTimer(null, false) } }
  }
  // finishing the last block of a session pauses at the session's end and asks what's next
  const from = fromId ? s.plan.blocks.find((b) => b.id === fromId) : null
  // (a bonus break is what you chose at the gate, so it flows straight into the next session)
  const ended = from && !from.bonus ? sessionOf(s.plan, from.id) : null
  if (ended && sessionOf(s.plan, next.id)?.id !== ended.id) {
    return { ...s, run: { ...s.run, phase: 'active', currentId: next.id, gate: { sessionId: ended.id, nextId: next.id }, timer: freshTimer(null, false) } }
  }
  const start = forceStart ?? s.settings.autoStartNext
  return { ...s, run: { ...s.run, phase: 'active', currentId: next.id, gate: null, timer: freshTimer(startAt ?? now, start) } }
}

/** Resolve any breaks whose countdown ran out (possibly while the page was closed). */
function settleBreaks(s: AppState, now: number): AppState {
  let guard = 0
  while (guard++ < 200 && s.run.phase === 'active' && s.settings.breakEnd === 'auto' && !s.run.gate) {
    const b = currentBlock(s)
    if (!b || b.type !== 'break') break
    const at = expiryAt(b, s.run.timer)
    if (at == null || at > now) break
    // the break ends at its exact expiry moment, and the next block starts then
    s = leaveCurrent(s, 'completed', now, { spentMs: totalMsOf(b, s.run.timer), nextStartAt: at, forceStart: true })
  }
  return s
}

/** If the current block disappeared or changed, keep the run consistent. */
function repairRun(s: AppState, now: number): AppState {
  if (s.run.phase !== 'active') return s
  if (!s.run.currentId || !s.plan.blocks.some((b) => b.id === s.run.currentId)) {
    return advance({ ...s, run: { ...s.run, currentId: null } }, now)
  }
  return s
}

export function reducer(s: AppState, a: Action): AppState {
  const next = step(s, a)
  // a finished day is written to history as soon as it finishes (and kept up to date)
  if (next !== s && next.run.phase === 'done' && a.type !== 'HYDRATE') return archive(next, 'now' in a ? a.now : Date.now())
  return next
}

function step(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'HYDRATE':
      return a.state

    case 'START_DAY': {
      const first = nextPending(s.plan, s.run, null)
      if (!first) return s
      return {
        ...s,
        run: { ...s.run, date: todayKey(a.now), phase: 'active', currentId: first.id, startedAt: s.run.startedAt ?? a.now, timer: freshTimer(a.now, true) },
      }
    }

    case 'START':
    case 'RESUME': {
      if (s.run.phase !== 'active' || s.run.timer.status === 'running') return s
      return { ...s, run: { ...s.run, timer: { ...s.run.timer, status: 'running', startedAt: a.now } } }
    }

    case 'PAUSE': {
      const t = s.run.timer
      if (t.status !== 'running') return s
      return { ...s, run: { ...s.run, timer: { ...t, status: 'paused', startedAt: null, elapsedMs: elapsedOf(t, a.now) } } }
    }

    case 'FINISH':
      if (s.run.phase !== 'active') return s
      return leaveCurrent(s, 'completed', a.now)

    case 'SKIP':
      if (s.run.phase !== 'active') return s
      return leaveCurrent(s, 'skipped', a.now)

    case 'EXTEND': {
      if (s.run.phase !== 'active') return s
      const t = s.run.timer
      const b = currentBlock(s)
      if (!b) return s
      // extending after time ran out adds time from *now*, not on top of the overtime
      const over = Math.max(0, elapsedOf(t, a.now) - totalMsOf(b, t))
      return {
        ...s,
        run: {
          ...s.run,
          timer: {
            ...t,
            extendMs: t.extendMs + over + a.minutes * MIN,
            alerted: false,
            overtimeAck: false,
          },
        },
      }
    }

    case 'KEEP_GOING':
      return { ...s, run: { ...s.run, timer: { ...s.run.timer, overtimeAck: true } } }

    case 'MARK_ALERTED':
      return { ...s, run: { ...s.run, timer: { ...s.run.timer, alerted: true } } }

    case 'TICK':
      return settleBreaks(s, a.now)

    case 'JUMP_TO': {
      if (!s.plan.blocks.some((b) => b.id === a.id)) return s
      let run = s.run
      if (run.phase === 'active' && run.currentId) {
        if (run.currentId === a.id) return s
        const r = rec(run, run.currentId)
        run = { ...run, records: { ...run.records, [run.currentId]: { ...r, status: 'pending', spentMs: r.spentMs + elapsedOf(run.timer, a.now) } } }
      }
      const target = rec(run, a.id)
      run = {
        ...run,
        date: run.phase === 'idle' ? todayKey(a.now) : run.date,
        phase: 'active',
        startedAt: run.startedAt ?? a.now,
        endedAt: null,
        endedEarly: false,
        gate: null,
        currentId: a.id,
        records: { ...run.records, [a.id]: { ...target, status: 'pending' } },
        timer: freshTimer(a.now, true),
      }
      return { ...s, run }
    }

    case 'END_DAY': {
      if (s.run.phase === 'done') return s
      let run = s.run
      if (run.phase === 'active' && run.currentId) {
        const r = rec(run, run.currentId)
        run = { ...run, records: { ...run.records, [run.currentId]: { ...r, spentMs: r.spentMs + elapsedOf(run.timer, a.now) } } }
      }
      const early = s.plan.blocks.some((b) => statusOf(run, b.id) === 'pending')
      return { ...s, run: { ...run, phase: 'done', currentId: null, gate: null, endedAt: a.now, endedEarly: early, timer: freshTimer(null, false) } }
    }

    case 'RESET_DAY':
      return { ...archive(s, a.now), run: freshRun(a.now) }

    case 'ADD_BLOCK': {
      const blocks = [...s.plan.blocks]
      const i = a.index == null ? blocks.length : Math.max(0, Math.min(a.index, blocks.length))
      blocks.splice(i, 0, a.block)
      // a day that was finished gets reopened (ready to continue) when new work is added
      const run = s.run.phase === 'done' && !s.run.endedEarly ? { ...s.run, phase: 'idle' as const, endedAt: null } : s.run
      return { ...s, plan: { ...s.plan, blocks }, run }
    }

    case 'UPDATE_BLOCK': {
      const blocks = s.plan.blocks.map((b) => (b.id === a.id ? sanitize({ ...b, ...a.patch }) : b))
      return { ...s, plan: { ...s.plan, blocks } }
    }

    case 'DELETE_BLOCK': {
      const blocks = s.plan.blocks.filter((b) => b.id !== a.id)
      const records = { ...s.run.records }
      delete records[a.id]
      const gate = s.run.gate && (s.run.gate.sessionId === a.id || s.run.gate.nextId === a.id) ? null : s.run.gate
      let next: AppState = { ...s, plan: { ...s.plan, blocks }, run: { ...s.run, records, gate } }
      if (s.run.currentId === a.id) next = advance({ ...next, run: { ...next.run, currentId: null } }, a.now)
      if (blocks.length === 0) next = { ...next, run: freshRun(a.now) }
      return next
    }

    case 'MOVE_BLOCK': {
      const blocks = [...s.plan.blocks]
      if (a.from === a.to || a.from < 0 || a.to < 0 || a.from >= blocks.length || a.to >= blocks.length) return s
      const [m] = blocks.splice(a.from, 1)
      blocks.splice(a.to, 0, m)
      return { ...s, plan: { ...s.plan, blocks } }
    }

    case 'SET_START_TIME':
      return { ...s, plan: { ...s.plan, startTime: a.value } }

    case 'SET_BLOCKS':
      s = archive(s, a.now)
      return {
        ...s,
        plan: { startTime: a.startTime ?? s.plan.startTime, blocks: a.blocks.map(sanitize), eventId: a.blocks.length ? s.plan.eventId ?? null : null },
        run: freshRun(a.now),
      }

    case 'SAVE_TEMPLATE': {
      const name = a.name.trim() || 'Untitled'
      const copy = s.plan.blocks.map((b) => ({ ...b }))
      const existing = s.templates.find((t) => t.name.toLowerCase() === name.toLowerCase())
      const templates = existing
        ? s.templates.map((t) => (t.id === existing.id ? { ...t, startTime: s.plan.startTime, blocks: copy, createdAt: a.now, eventId: s.plan.eventId ?? null } : t))
        : [...s.templates, { id: uid(), name, startTime: s.plan.startTime, blocks: copy, createdAt: a.now, eventId: s.plan.eventId ?? null }]
      return { ...s, templates }
    }

    case 'LOAD_TEMPLATE': {
      const t = s.templates.find((x) => x.id === a.id)
      if (!t) return s
      // fresh ids so a template can be loaded repeatedly without collisions
      const blocks = t.blocks.map((b) => ({ ...b, id: uid() }))
      const eventId = t.eventId && s.events.some((e) => e.id === t.eventId) ? t.eventId : null
      return { ...archive(s, a.now), plan: { startTime: t.startTime, blocks, eventId }, run: freshRun(a.now) }
    }

    case 'DELETE_TEMPLATE':
      return { ...s, templates: s.templates.filter((t) => t.id !== a.id) }

    case 'SETTINGS':
      return { ...s, settings: { ...s.settings, ...a.patch } }

    case 'ADD_EVENT': {
      const events = [...s.events, a.event].sort((x, y) => x.date.localeCompare(y.date))
      return { ...s, events, plan: a.attach ? { ...s.plan, eventId: a.event.id } : s.plan }
    }

    case 'DELETE_EVENT':
      return {
        ...s,
        events: s.events.filter((e) => e.id !== a.id),
        plan: s.plan.eventId === a.id ? { ...s.plan, eventId: null } : s.plan,
        templates: s.templates.map((t) => (t.eventId === a.id ? { ...t, eventId: null } : t)),
      }

    case 'SET_PLAN_EVENT':
      return { ...s, plan: { ...s.plan, eventId: a.id } }

    case 'TAKE_BONUS_BREAK': {
      const gate = s.run.gate
      if (!gate) return s
      const minutes = Math.max(1, Math.round(a.minutes))
      const block: Block = { id: uid(), type: 'break', name: a.name, description: '', duration: minutes, timed: true, bonus: true }
      // the bonus break sits at the end of the session that earned it
      const at = s.plan.blocks.findIndex((b) => b.id === gate.sessionId)
      const members = sessionBlocks(s.plan, gate.sessionId)
      const lastIdx = members.length ? s.plan.blocks.findIndex((b) => b.id === members[members.length - 1].id) : at
      const blocks = [...s.plan.blocks]
      blocks.splice(lastIdx + 1, 0, block)
      return { ...s, plan: { ...s.plan, blocks }, run: { ...s.run, gate: null, currentId: block.id, timer: freshTimer(a.now, true) } }
    }

    case 'CONTINUE_SESSION': {
      if (!s.run.gate) return s
      return { ...s, run: { ...s.run, gate: null, timer: freshTimer(a.now, true) } }
    }

    case 'SET_FORECAST':
      return { ...s, forecast: a.forecast }

    case 'SET_RECAP': {
      const next = { ...s, run: { ...s.run, recap: a.recap } }
      return { ...next, history: next.history.map((h) => (h.id === next.run.id ? { ...h, recap: a.recap } : h)) }
    }
  }
}

export function sanitize(b: Block): Block {
  const duration = b.type === 'session' ? 0 : Math.max(1, Math.min(600, Math.round(Number(b.duration) || 1)))
  return {
    ...b,
    name: b.name ?? '',
    description: b.description ?? '',
    duration,
    timed: b.type === 'task' ? b.timed : true,
  }
}

/** Validate/repair anything read from storage. */
export function revive(raw: unknown, now: number): AppState {
  const base = initialState(now)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<AppState>
  const blocks = Array.isArray(r.plan?.blocks) ? r.plan!.blocks.filter((b) => b && typeof b.id === 'string').map(sanitize) : []
  const s: AppState = {
    version: 1,
    plan: { startTime: typeof r.plan?.startTime === 'string' ? r.plan.startTime : '08:00', blocks },
    templates: Array.isArray(r.templates) ? r.templates : [],
    settings: {
      ...defaultSettings,
      lang: typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en',
      ...(r.settings ?? {}),
    },
    run: r.run && typeof r.run === 'object' ? { ...freshRun(now), ...r.run, timer: { ...freshTimer(null, false), ...r.run.timer } } : freshRun(now),
    events: Array.isArray(r.events) ? r.events.filter((e) => e && typeof e.id === 'string' && typeof e.date === 'string') : [],
    history: Array.isArray(r.history) ? r.history : [],
    forecast: r.forecast && typeof r.forecast === 'object' ? r.forecast : null,
  }
  if (s.plan.eventId && !s.events.some((e) => e.id === s.plan.eventId)) s.plan = { ...s.plan, eventId: null }
  // a finished (or never-started) day from an earlier date rolls over to a fresh day
  if (s.run.date !== todayKey(now) && s.run.phase !== 'active') {
    s.history = archive(s, now).history
    s.run = freshRun(now)
  }
  return repairRun(settleBreaks(s, now), now)
}
