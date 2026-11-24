import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { bankOf, currentBlock, elapsedOf, nextPending, progressOf, remainingOf, scheduleOf, taskNumber, tasksOf, totalMsOf, sampleBlocks } from '../lib/engine'
import { clock, hm, human, minutesLabel, signed, stopwatch } from '../lib/format'
import { go } from '../lib/route'
import type { Block } from '../lib/types'
import { Summary } from './Summary'
import { planetFx, type FxTint } from '../lib/fx'
import { eventOf } from '../lib/engine'
import { EventTag } from './Events'
import { nMin, nTasks, t as tx } from '../lib/i18n'

const tintOf = (b: Block | null | undefined): FxTint => (b?.type === 'break' ? 'break' : 'task')
const mainButton = () => document.querySelector('.primary')

export function Now() {
  const { state } = useStore()
  const { plan, run } = state
  if (plan.blocks.length === 0) return <Empty />
  if (run.phase === 'done') return <Summary />
  if (run.phase === 'idle') return <Ready />
  const b = currentBlock(state)
  if (!b) return <Ready />
  return b.type === 'break' ? <BreakMode b={b} /> : <TaskMode b={b} />
}

/* ---------- shared bits ---------- */

function Progress() {
  const { state } = useStore()
  const p = progressOf(state)
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.handled} aria-label={tx('day')}>
      <div className="progress-fill" style={{ transform: `scaleX(${p.ratio})` }} />
    </div>
  )
}

/** Top-right: minutes saved (finished early) or lost (ran over) against the plan. */
function Bank() {
  const { state, now } = useStore()
  const { ms, counted } = bankOf(state, now)
  if (!counted || Math.abs(ms) < 1000) return null
  const ahead = ms > 0
  return (
    <span className={`bank ${ahead ? 'is-ahead' : 'is-behind'}`} title={ahead ? tx('savedTitle') : tx('behindTitle')}>
      <span className="bank-value">{signed(ms)}</span>
      <span className="bank-label">{ahead ? tx('saved') : tx('behind')}</span>
    </span>
  )
}

function MetaRight() {
  return (
    <span className="meta-right">
      <Bank />
      <button className="link quiet" onClick={() => go('day')}>
        {tx('overview')}
      </button>
    </span>
  )
}

function useShortcuts(map: Record<string, () => void>) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (document.querySelector('.sheet-backdrop')) return
      const k = e.key === ' ' ? 'space' : e.key.toLowerCase()
      const fn = map[k]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })
}

/* ---------- task mode ---------- */

function TaskMode({ b }: { b: Block }) {
  const { state, now, act, step } = useStore()
  const { run, plan, settings } = state
  const t = run.timer
  const [extendOpen, setExtendOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const rem = remainingOf(b, t, now)
  const elapsed = elapsedOf(t, now)
  const expired = rem != null && rem <= 0
  const askOpen = expired && settings.taskEnd === 'ask' && !t.overtimeAck
  const n = taskNumber(plan, b.id)
  const total = tasksOf(plan).length
  const ready = t.status === 'ready'
  const paused = t.status === 'paused'

  const finish = () => {
    planetFx('orbit', mainButton(), tintOf(nextPending(plan, run, b.id)))
    step('FINISH', tx('completedToast', { name: b.name || tx('task') }))
  }
  const skip = () => step('SKIP', tx('skippedToast', { name: b.name || tx('task') }))
  const toggle = () => {
    if (ready) planetFx('launch', mainButton())
    act({ type: ready ? 'START' : paused ? 'RESUME' : 'PAUSE' })
  }
  const extend = (m: number) => {
    act({ type: 'EXTEND', minutes: m })
    setExtendOpen(false)
  }

  useShortcuts({ enter: ready ? toggle : finish, f: finish, space: toggle, p: toggle, s: skip, e: () => b.timed && extend(5) })

  useEffect(() => {
    setExtendOpen(false)
    setEnding(false)
  }, [b.id])

  let timeLabel: string
  if (!b.timed) timeLabel = paused ? tx('paused') : ready ? tx('untimed') : tx('elapsed')
  else if (paused) timeLabel = tx('paused')
  else if (ready) timeLabel = tx('ready')
  else if (expired) timeLabel = tx('overTime')
  else timeLabel = tx('ofTotal', { t: human(totalMsOf(b, t)) })

  return (
    <main className="stage mode-task">
      <div className="stage-top">
        <div className="meta">
          <span>{tx('taskOf', { n: String(n), total: String(total) })}</span>
          <MetaRight />
        </div>
        <Progress />
      </div>

      <section className="focus" key={b.id}>
        <h1 className={`task-name ${nameSize(b.name)}`}>{b.name || tx('untitled')}</h1>
        {b.description && <p className="task-desc">{b.description}</p>}
        <div className={`timer ${paused ? 'is-paused' : ''} ${expired && b.timed ? 'is-over' : ''}`}>
          <span className="timer-digits" aria-live="off" dir="ltr">
            {b.timed ? clock(rem!) : stopwatch(elapsed)}
          </span>
          <span className="timer-label">{timeLabel}</span>
        </div>
      </section>

      <section className="controls">
        {askOpen && (
          <div className="timeup" role="alert">
            <span className="timeup-title">{tx('timesUp')}</span>
            <div className="timeup-row">
              <button className="chip" onClick={() => extend(5)}>+{nMin(5)}</button>
              <button className="chip" onClick={() => extend(10)}>+{nMin(10)}</button>
              <button className="chip" onClick={skip}>{tx('skip')}</button>
              <button className="chip ghost" onClick={() => act({ type: 'KEEP_GOING' })}>{tx('keepGoing')}</button>
            </div>
          </div>
        )}

        {ready ? (
          <button className="primary" onClick={toggle} autoFocus>
            {tx('start')}
          </button>
        ) : (
          <button className="primary" onClick={finish}>
            {tx('finish')}
          </button>
        )}

        {ending ? (
          <EndConfirm onCancel={() => setEnding(false)} />
        ) : askOpen ? null : extendOpen ? (
          <div className="secondary">
            {[5, 10, 15].map((m) => (
              <button key={m} className="link" onClick={() => extend(m)}>
                +{nMin(m)}
              </button>
            ))}
            <button className="link quiet" onClick={() => setExtendOpen(false)}>
              {tx('cancel')}
            </button>
          </div>
        ) : (
          <div className="secondary">
            {ready ? (
              <button className="link" onClick={finish}>{tx('finish')}</button>
            ) : (
              <button className="link" onClick={toggle}>{paused ? tx('resume') : tx('pause')}</button>
            )}
            {b.timed && (
              <button className="link" onClick={() => setExtendOpen(true)}>
                {tx('extend')}
              </button>
            )}
            <button className="link" onClick={skip}>
              {tx('skip')}
            </button>
            <button className="link quiet" onClick={() => setEnding(true)}>
              {tx('endSession')}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

/** Inline confirmation that replaces the small controls row. */
function EndConfirm({ onCancel }: { onCancel: () => void }) {
  const { state, act } = useStore()
  const left = tasksOf(state.plan).filter((t) => (state.run.records[t.id]?.status ?? 'pending') === 'pending').length
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onCancel])
  return (
    <div className="secondary end-confirm" role="group" aria-label={tx('endSession')}>
      <span className="end-q">
        {tx('endSessionQ')}
        {left > 0 ? ' ' + tx('staysUnfinished', { tasks: nTasks(left) }) : ''}
      </span>
      <button className="link danger" onClick={() => act({ type: 'END_DAY' })} autoFocus>
        {tx('endSession')}
      </button>
      <button className="link quiet" onClick={onCancel}>
        {tx('cancel')}
      </button>
    </div>
  )
}

function nameSize(name: string) {
  const len = name.length
  if (len > 48) return 'len-xl'
  if (len > 28) return 'len-l'
  if (len > 14) return 'len-m'
  return ''
}

/* ---------- break mode ---------- */

function BreakMode({ b }: { b: Block }) {
  const { state, now, act, step } = useStore()
  const { run, plan, settings } = state
  const t = run.timer
  const rem = remainingOf(b, t, now)!
  const total = totalMsOf(b, t)
  const over = rem <= 0
  const paused = t.status === 'paused'
  const ready = t.status === 'ready'
  const next = nextPending(plan, run, b.id)
  const nextN = next && next.type === 'task' ? taskNumber(plan, next.id) : null
  const waiting = over && settings.breakEnd === 'wait'
  const [ending, setEnding] = useState(false)
  const toggle = () => act({ type: ready ? 'START' : paused ? 'RESUME' : 'PAUSE' })
  const end = () => {
    planetFx('launch', mainButton(), tintOf(next))
    step('FINISH', tx('breakEnded'))
  }

  useShortcuts({ enter: end, f: end, space: toggle, p: toggle, e: () => act({ type: 'EXTEND', minutes: 5 }) })

  const fraction = Math.max(0, Math.min(1, rem / total))

  return (
    <main className="stage mode-break">
      <div className="stage-top">
        <div className="meta">
          <span>{b.name && !['break', 'استراحة'].includes(b.name.toLowerCase()) ? b.name : tx('break')}</span>
          <MetaRight />
        </div>
        <Progress />
      </div>

      <section className="focus" key={b.id}>
        <div className="break-label">{waiting ? tx('breaksOver') : tx('break')}</div>
        <div className={`timer timer-break ${paused ? 'is-paused' : ''}`}>
          <span className="timer-digits" dir="ltr">{clock(Math.max(0, rem))}</span>
          <span className="timer-label">
            {paused ? tx('paused') : ready ? tx('ready') : waiting ? tx('readyWhenYouAre') : tx('leftOf', { left: human(Math.max(0, rem)), total: human(total) })}
          </span>
        </div>
        <div className="drain" aria-hidden>
          <div className="drain-fill" style={{ transform: `scaleX(${fraction})` }} />
        </div>
        {b.description && <p className="task-desc">{b.description}</p>}
        <div className="next">
          <span className="next-label">{tx('nextTask')}</span>
          {next ? (
            <>
              <span className="next-name">{next.name || (next.type === 'break' ? tx('break') : tx('untitled'))}</span>
              <span className="next-meta">
                {next.type === 'task' ? tx('taskOf', { n: String(nextN), total: String(tasksOf(plan).length) }) + ' · ' : ''}
                {next.type === 'task' && !next.timed ? tx('untimed') : minutesLabel(next.duration)}
              </span>
            </>
          ) : (
            <span className="next-name">{tx('lastBlock')}</span>
          )}
        </div>
      </section>

      <section className="controls">
        <button className="primary" onClick={end} autoFocus>
          {waiting && next ? tx('startX', { name: next.name || tx('nextTask') }) : tx('endBreak')}
        </button>
        {ending ? (
          <EndConfirm onCancel={() => setEnding(false)} />
        ) : (
        <div className="secondary">
          {ready ? (
            <button className="link" onClick={toggle}>{tx('startBreak')}</button>
          ) : !waiting ? (
            <button className="link" onClick={toggle}>{paused ? tx('resume') : tx('pause')}</button>
          ) : null}
          <button className="link" onClick={() => act({ type: 'EXTEND', minutes: 5 })}>
            +{nMin(5)}
          </button>
          <button className="link quiet" onClick={() => setEnding(true)}>
            {tx('endSession')}
          </button>
        </div>
        )}
      </section>
    </main>
  )
}

/* ---------- before the day starts ---------- */

function Ready() {
  const { state, act } = useStore()
  const { plan, run } = state
  const first = nextPending(plan, run, null)
  const continuing = Object.keys(run.records).length > 0
  const startDay = () => {
    if (!first) return
    planetFx('launch', mainButton(), tintOf(first))
    act({ type: 'START_DAY' })
  }
  useShortcuts({ enter: startDay })
  if (!first) return <Summary />

  const sched = scheduleOf(plan)
  const tasks = tasksOf(plan).length
  const totalMin = plan.blocks.reduce((a, b) => a + b.duration, 0)
  const start = sched[0]?.start ?? 0
  const n = first.type === 'task' ? taskNumber(plan, first.id) : null

  return (
    <main className="stage mode-task">
      <div className="stage-top">
        <div className="meta">
          <span>
            {tx('today')} · {nTasks(tasks)} · {human(totalMin * 60_000)} · <bdi dir="ltr">{hm(start)}–{hm(start + totalMin)}</bdi>
          </span>
          <button className="link quiet" onClick={() => go('plan')}>
            {tx('editPlan')}
          </button>
        </div>
        <Progress />
      </div>

      <section className="focus" key={first.id}>
        <span className="eyebrow">
          {continuing ? tx('upNext') : tx('firstUp')}
          <EventTag ev={eventOf(state, plan.eventId)} now={Date.now()} />
        </span>
        <h1 className={`task-name ${nameSize(first.name)}`}>{first.name || (first.type === 'break' ? tx('break') : tx('untitled'))}</h1>
        {first.description && <p className="task-desc">{first.description}</p>}
        <div className="timer">
          <span className="timer-digits dim" dir="ltr">{first.type === 'task' && !first.timed ? '00:00' : clock(first.duration * 60_000)}</span>
          <span className="timer-label">{n ? tx('taskOf', { n: String(n), total: String(tasks) }) : tx('break')}</span>
        </div>
      </section>

      <section className="controls">
        <button className="primary" onClick={startDay} autoFocus>
          {continuing ? tx('continue') : tx('startDay')}
        </button>
        <div className="secondary">
          <button className="link" onClick={() => go('day')}>
            {tx('overview')}
          </button>
        </div>
      </section>
    </main>
  )
}

function Empty() {
  const { act } = useStore()
  return (
    <main className="stage mode-task">
      <div className="stage-top" />
      <section className="focus">
        <span className="eyebrow">{tx('nothingPlanned')}</span>
        <h1 className="task-name len-m">{tx('emptyTitle')}</h1>
        <p className="task-desc">{tx('emptyText')}</p>
      </section>
      <section className="controls">
        <button className="primary" onClick={(e) => {
          planetFx('launch', e.currentTarget)
          go('plan')
        }} autoFocus>
          {tx('planYourDay')}
        </button>
        <div className="secondary">
          <button className="link" onClick={() => act({ type: 'SET_BLOCKS', blocks: sampleBlocks(), startTime: '08:00' })}>
            {tx('sampleDay')}
          </button>
        </div>
      </section>
    </main>
  )
}
