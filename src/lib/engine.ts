import type { AppState, Block, BlockRecord, Plan, Run, Settings, Timer } from './types'

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
  date: todayKey(now),
  phase: 'idle',
  currentId: null,
  records: {},
  timer: freshTimer(null, false),
  startedAt: null,
  endedAt: null,
  endedEarly: false,
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
}

export const sampleBlocks = (): Block[] => [
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
})

/* ---------- selectors ---------- */

export const elapsedOf = (t: Timer, now: number) =>
  t.elapsedMs + (t.status === 'running' && t.startedAt != null ? Math.max(0, now - t.startedAt) : 0)

export const totalMsOf = (b: Block, t: Timer) => b.duration * MIN + t.extendMs

export const isCountdown = (b: Block) => b.type === 'break' || b.timed

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
  plan.blocks.find((b) => b.id !== excludeId && statusOf(run, b.id) === 'pending') ?? null

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
    total: tasks.length,
    completed: completed.length,
    focusedMs,
    breakMs,
    percent: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0,
    skipped,
    incomplete,
  }
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
  return advance({ ...s, run: { ...run, records } }, now, opts.nextStartAt, opts.forceStart)
}

function advance(s: AppState, now: number, startAt?: number, forceStart?: boolean): AppState {
  const next = nextPending(s.plan, s.run, s.run.currentId)
  if (!next) {
    return { ...s, run: { ...s.run, phase: 'done', currentId: null, endedAt: startAt ?? now, timer: freshTimer(null, false) } }
  }
  const start = forceStart ?? s.settings.autoStartNext
  return { ...s, run: { ...s.run, phase: 'active', currentId: next.id, timer: freshTimer(startAt ?? now, start) } }
}

/** Resolve any breaks whose countdown ran out (possibly while the page was closed). */
function settleBreaks(s: AppState, now: number): AppState {
  let guard = 0
  while (guard++ < 200 && s.run.phase === 'active' && s.settings.breakEnd === 'auto') {
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
      return { ...s, run: { ...run, phase: 'done', currentId: null, endedAt: a.now, endedEarly: early, timer: freshTimer(null, false) } }
    }

    case 'RESET_DAY':
      return { ...s, run: freshRun(a.now) }

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
      let next: AppState = { ...s, plan: { ...s.plan, blocks }, run: { ...s.run, records } }
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
      return {
        ...s,
        plan: { startTime: a.startTime ?? s.plan.startTime, blocks: a.blocks.map(sanitize) },
        run: freshRun(a.now),
      }

    case 'SAVE_TEMPLATE': {
      const name = a.name.trim() || 'Untitled'
      const copy = s.plan.blocks.map((b) => ({ ...b }))
      const existing = s.templates.find((t) => t.name.toLowerCase() === name.toLowerCase())
      const templates = existing
        ? s.templates.map((t) => (t.id === existing.id ? { ...t, startTime: s.plan.startTime, blocks: copy, createdAt: a.now } : t))
        : [...s.templates, { id: uid(), name, startTime: s.plan.startTime, blocks: copy, createdAt: a.now }]
      return { ...s, templates }
    }

    case 'LOAD_TEMPLATE': {
      const t = s.templates.find((x) => x.id === a.id)
      if (!t) return s
      // fresh ids so a template can be loaded repeatedly without collisions
      const blocks = t.blocks.map((b) => ({ ...b, id: uid() }))
      return { ...s, plan: { startTime: t.startTime, blocks }, run: freshRun(a.now) }
    }

    case 'DELETE_TEMPLATE':
      return { ...s, templates: s.templates.filter((t) => t.id !== a.id) }

    case 'SETTINGS':
      return { ...s, settings: { ...s.settings, ...a.patch } }
  }
}

export function sanitize(b: Block): Block {
  const duration = Math.max(1, Math.min(600, Math.round(Number(b.duration) || 1)))
  return {
    ...b,
    name: b.name ?? '',
    description: b.description ?? '',
    duration,
    timed: b.type === 'break' ? true : b.timed,
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
    settings: { ...defaultSettings, ...(r.settings ?? {}) },
    run: r.run && typeof r.run === 'object' ? { ...freshRun(now), ...r.run, timer: { ...freshTimer(null, false), ...r.run.timer } } : freshRun(now),
  }
  // a finished (or never-started) day from an earlier date rolls over to a fresh day
  if (s.run.date !== todayKey(now) && s.run.phase !== 'active') s.run = freshRun(now)
  return repairRun(settleBreaks(s, now), now)
}
