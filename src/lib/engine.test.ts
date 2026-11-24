import { describe, expect, it } from 'vitest'
import { MIN, bankOf, daysUntil, initialState, reducer, remainingOf, currentBlock, summaryOf, progressOf, revive, type Action } from './engine'
import type { AppState, Block } from './types'

const T0 = new Date(2026, 10, 24, 8, 0, 0).getTime()
const blocks: Block[] = [
  { id: 'a', type: 'task', name: 'Math', description: '', duration: 45, timed: true },
  { id: 'b', type: 'break', name: 'Break', description: '', duration: 10, timed: true },
  { id: 'c', type: 'task', name: 'Physics', description: '', duration: 50, timed: true },
  { id: 'd', type: 'task', name: 'Read', description: '', duration: 20, timed: false },
]
const setup = (): AppState => {
  let s = initialState(T0)
  s = reducer(s, { type: 'SET_BLOCKS', blocks, now: T0 })
  return s
}
const run = (s: AppState, ...as: Action[]) => as.reduce(reducer, s)

describe('engine', () => {
  it('starts the day on the first block with a running timer', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 })
    expect(s.run.currentId).toBe('a')
    expect(remainingOf(currentBlock(s)!, s.run.timer, T0 + 5 * MIN)).toBe(40 * MIN)
  })

  it('finish marks completed and moves to the break', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'FINISH', now: T0 + 30 * MIN })
    expect(s.run.records.a.status).toBe('completed')
    expect(s.run.records.a.spentMs).toBe(30 * MIN)
    expect(currentBlock(s)!.type).toBe('break')
  })

  it('timer expiry does not complete a task', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'TICK', now: T0 + 60 * MIN })
    expect(s.run.currentId).toBe('a')
    expect(s.run.records.a).toBeUndefined()
    expect(remainingOf(currentBlock(s)!, s.run.timer, T0 + 60 * MIN)).toBe(-15 * MIN)
  })

  it('pause freezes time; resume continues', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'PAUSE', now: T0 + 10 * MIN }, { type: 'RESUME', now: T0 + 40 * MIN })
    expect(remainingOf(currentBlock(s)!, s.run.timer, T0 + 45 * MIN)).toBe(30 * MIN)
  })

  it('extend after expiry gives fresh minutes from now', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'EXTEND', minutes: 5, now: T0 + 50 * MIN })
    expect(remainingOf(currentBlock(s)!, s.run.timer, T0 + 50 * MIN)).toBe(5 * MIN)
  })

  it('break auto-ends at its exact expiry, even if the page was closed', () => {
    let s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'FINISH', now: T0 + 45 * MIN })
    // come back 30 minutes later
    s = reducer(s, { type: 'TICK', now: T0 + 75 * MIN })
    expect(s.run.records.b.status).toBe('completed')
    expect(s.run.records.b.spentMs).toBe(10 * MIN)
    expect(s.run.currentId).toBe('c')
    // physics started when the break ended (08:55), so 20 min have passed
    expect(remainingOf(currentBlock(s)!, s.run.timer, T0 + 75 * MIN)).toBe(30 * MIN)
  })

  it('revive restores an in-flight timer accurately', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 })
    const restored = revive(JSON.parse(JSON.stringify(s)), T0 + 12 * MIN)
    expect(remainingOf(currentBlock(restored)!, restored.run.timer, T0 + 12 * MIN)).toBe(33 * MIN)
  })

  it('runs to completion and summarises', () => {
    const s = run(
      setup(),
      { type: 'START_DAY', now: T0 },
      { type: 'FINISH', now: T0 + 45 * MIN },
      { type: 'FINISH', now: T0 + 50 * MIN }, // end break early
      { type: 'SKIP', now: T0 + 55 * MIN },
      { type: 'FINISH', now: T0 + 75 * MIN },
    )
    expect(s.run.phase).toBe('done')
    const sum = summaryOf(s, T0 + 80 * MIN)
    expect(sum.completed).toBe(2)
    expect(sum.total).toBe(3)
    expect(sum.percent).toBe(67)
    expect(sum.skipped.map((b) => b.id)).toEqual(['c'])
    expect(sum.focusedMs).toBe(45 * MIN + 5 * MIN + 20 * MIN)
    expect(sum.breakMs).toBe(5 * MIN)
    expect(progressOf(s).ratio).toBe(1)
  })

  it('deleting the current block moves on', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'DELETE_BLOCK', id: 'a', now: T0 + MIN })
    expect(s.run.currentId).toBe('b')
  })

  it('jump to a skipped task brings it back', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'SKIP', now: T0 + MIN }, { type: 'JUMP_TO', id: 'a', now: T0 + 2 * MIN })
    expect(s.run.currentId).toBe('a')
    expect(s.run.records.a.status).toBe('pending')
    expect(s.run.records.b.status).toBe('pending')
  })

  it('end day leaves remaining tasks incomplete', () => {
    const s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'FINISH', now: T0 + 40 * MIN }, { type: 'END_DAY', now: T0 + 41 * MIN })
    const sum = summaryOf(s, T0 + 41 * MIN)
    expect(s.run.endedEarly).toBe(true)
    expect(sum.incomplete.map((b) => b.id)).toEqual(['c', 'd'])
  })

  it('templates save and load with fresh ids', () => {
    let s = run(setup(), { type: 'SAVE_TEMPLATE', name: 'Weekday', now: T0 })
    s = reducer(s, { type: 'SET_BLOCKS', blocks: [], now: T0 })
    s = reducer(s, { type: 'LOAD_TEMPLATE', id: s.templates[0].id, now: T0 })
    expect(s.plan.blocks.map((b) => b.name)).toEqual(['Math', 'Break', 'Physics', 'Read'])
    expect(s.plan.blocks[0].id).not.toBe('a')
  })
})

describe('time bank', () => {
  it('finishing early banks the difference, running over takes it back', () => {
    let s = run(setup(), { type: 'START_DAY', now: T0 }, { type: 'FINISH', now: T0 + 40 * MIN })
    expect(bankOf(s, T0 + 40 * MIN).ms).toBe(5 * MIN)
    // end the 10-min break after 7 → 3 more saved
    s = reducer(s, { type: 'FINISH', now: T0 + 47 * MIN })
    expect(bankOf(s, T0 + 47 * MIN).ms).toBe(8 * MIN)
    // physics (50) running 52 min → 2 min over, live
    expect(bankOf(s, T0 + 99 * MIN).ms).toBe(6 * MIN)
    s = reducer(s, { type: 'SKIP', now: T0 + 99 * MIN })
    // skipped blocks don't count
    expect(bankOf(s, T0 + 99 * MIN).ms).toBe(8 * MIN)
  })
})

describe('events and history', () => {
  it('attaches an event, counts days, and clears it on delete', () => {
    let s = reducer(setup(), { type: 'ADD_EVENT', event: { id: 'ev', name: 'Physics exam', date: '2026-12-06', createdAt: T0 }, attach: true })
    expect(s.plan.eventId).toBe('ev')
    expect(daysUntil('2026-12-06', T0)).toBe(12)
    s = reducer(s, { type: 'DELETE_EVENT', id: 'ev' })
    expect(s.plan.eventId).toBeNull()
  })

  it('archives a finished day with its recap', () => {
    let s = reducer(setup(), { type: 'ADD_EVENT', event: { id: 'ev', name: 'Exam', date: '2026-12-06', createdAt: T0 }, attach: true })
    s = run(s, { type: 'START_DAY', now: T0 }, { type: 'END_DAY', now: T0 + 30 * MIN })
    expect(s.history).toHaveLength(1)
    expect(s.history[0].eventName).toBe('Exam')
    expect(s.history[0].blocks[0].spentMs).toBe(30 * MIN)
    s = reducer(s, { type: 'SET_RECAP', recap: { title: 't', story: 's', wins: [], next: 'n', at: 1 }, now: T0 })
    expect(s.history[0].recap?.title).toBe('t')
    s = reducer(s, { type: 'RESET_DAY', now: T0 + 40 * MIN })
    expect(s.history).toHaveLength(1)
    expect(s.run.recap).toBeNull()
  })
})
