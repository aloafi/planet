import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { currentBlock, elapsedOf, nextPending, progressOf, remainingOf, scheduleOf, taskNumber, tasksOf, totalMsOf, sampleBlocks } from '../lib/engine'
import { clock, hm, human, minutesLabel, stopwatch } from '../lib/format'
import { go } from '../lib/route'
import type { Block } from '../lib/types'
import { Summary } from './Summary'

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
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.handled} aria-label="Daily progress">
      <div className="progress-fill" style={{ transform: `scaleX(${p.ratio})` }} />
    </div>
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
  const rem = remainingOf(b, t, now)
  const elapsed = elapsedOf(t, now)
  const expired = rem != null && rem <= 0
  const askOpen = expired && settings.taskEnd === 'ask' && !t.overtimeAck
  const n = taskNumber(plan, b.id)
  const total = tasksOf(plan).length
  const ready = t.status === 'ready'
  const paused = t.status === 'paused'

  const finish = () => step('FINISH', `${b.name || 'Task'} completed`)
  const skip = () => step('SKIP', `${b.name || 'Task'} skipped`)
  const toggle = () => act({ type: ready ? 'START' : paused ? 'RESUME' : 'PAUSE' })
  const extend = (m: number) => {
    act({ type: 'EXTEND', minutes: m })
    setExtendOpen(false)
  }

  useShortcuts({ enter: ready ? toggle : finish, f: finish, space: toggle, p: toggle, s: skip, e: () => b.timed && extend(5) })

  useEffect(() => setExtendOpen(false), [b.id])

  let timeLabel: string
  if (!b.timed) timeLabel = paused ? 'Paused' : ready ? 'Untimed' : 'Elapsed'
  else if (paused) timeLabel = 'Paused'
  else if (ready) timeLabel = 'Ready'
  else if (expired) timeLabel = 'Over time'
  else timeLabel = `of ${human(totalMsOf(b, t))}`

  return (
    <main className="stage mode-task">
      <div className="stage-top">
        <div className="meta">
          <span>
            Task <b>{n}</b> of {total}
          </span>
          <button className="link quiet" onClick={() => go('day')}>
            Overview
          </button>
        </div>
        <Progress />
      </div>

      <section className="focus" key={b.id}>
        <h1 className={`task-name ${nameSize(b.name)}`}>{b.name || 'Untitled task'}</h1>
        {b.description && <p className="task-desc">{b.description}</p>}
        <div className={`timer ${paused ? 'is-paused' : ''} ${expired && b.timed ? 'is-over' : ''}`}>
          <span className="timer-digits" aria-live="off">
            {b.timed ? clock(rem!) : stopwatch(elapsed)}
          </span>
          <span className="timer-label">{timeLabel}</span>
        </div>
      </section>

      <section className="controls">
        {askOpen && (
          <div className="timeup" role="alert">
            <span className="timeup-title">Time’s up.</span>
            <div className="timeup-row">
              <button className="chip" onClick={() => extend(5)}>+5 min</button>
              <button className="chip" onClick={() => extend(10)}>+10 min</button>
              <button className="chip" onClick={skip}>Skip</button>
              <button className="chip ghost" onClick={() => act({ type: 'KEEP_GOING' })}>Keep going</button>
            </div>
          </div>
        )}

        {ready ? (
          <button className="primary" onClick={toggle} autoFocus>
            Start
          </button>
        ) : (
          <button className="primary" onClick={finish}>
            Finish
          </button>
        )}

        {askOpen ? null : extendOpen ? (
          <div className="secondary">
            {[5, 10, 15].map((m) => (
              <button key={m} className="link" onClick={() => extend(m)}>
                +{m} min
              </button>
            ))}
            <button className="link quiet" onClick={() => setExtendOpen(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="secondary">
            {ready ? (
              <button className="link" onClick={finish}>Finish</button>
            ) : (
              <button className="link" onClick={toggle}>{paused ? 'Resume' : 'Pause'}</button>
            )}
            {b.timed && (
              <button className="link" onClick={() => setExtendOpen(true)}>
                Extend
              </button>
            )}
            <button className="link" onClick={skip}>
              Skip
            </button>
          </div>
        )}
      </section>
    </main>
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
  const toggle = () => act({ type: ready ? 'START' : paused ? 'RESUME' : 'PAUSE' })
  const end = () => step('FINISH', 'Break ended')

  useShortcuts({ enter: end, f: end, space: toggle, p: toggle, e: () => act({ type: 'EXTEND', minutes: 5 }) })

  const fraction = Math.max(0, Math.min(1, rem / total))

  return (
    <main className="stage mode-break">
      <div className="stage-top">
        <div className="meta">
          <span>{b.name && b.name.toLowerCase() !== 'break' ? b.name : 'Break'}</span>
          <button className="link quiet" onClick={() => go('day')}>
            Overview
          </button>
        </div>
        <Progress />
      </div>

      <section className="focus" key={b.id}>
        <div className="break-label">{waiting ? 'Break’s over' : 'Break'}</div>
        <div className={`timer timer-break ${paused ? 'is-paused' : ''}`}>
          <span className="timer-digits">{clock(Math.max(0, rem))}</span>
          <span className="timer-label">
            {paused ? 'Paused' : ready ? 'Ready' : waiting ? 'Ready when you are' : `${human(Math.max(0, rem))} left of ${human(total)}`}
          </span>
        </div>
        <div className="drain" aria-hidden>
          <div className="drain-fill" style={{ transform: `scaleX(${fraction})` }} />
        </div>
        {b.description && <p className="task-desc">{b.description}</p>}
        <div className="next">
          <span className="next-label">Next task</span>
          {next ? (
            <>
              <span className="next-name">{next.name || (next.type === 'break' ? 'Break' : 'Untitled task')}</span>
              <span className="next-meta">
                {next.type === 'task' ? `Task ${nextN} of ${tasksOf(plan).length} · ` : ''}
                {next.type === 'task' && !next.timed ? 'Untimed' : minutesLabel(next.duration)}
              </span>
            </>
          ) : (
            <span className="next-name">Nothing — this is the last block</span>
          )}
        </div>
      </section>

      <section className="controls">
        <button className="primary" onClick={end} autoFocus>
          {waiting && next ? `Start ${next.name || 'next'}` : 'End break'}
        </button>
        <div className="secondary">
          {ready ? (
            <button className="link" onClick={toggle}>Start break</button>
          ) : !waiting ? (
            <button className="link" onClick={toggle}>{paused ? 'Resume' : 'Pause'}</button>
          ) : null}
          <button className="link" onClick={() => act({ type: 'EXTEND', minutes: 5 })}>
            +5 min
          </button>
        </div>
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
  useShortcuts({ enter: () => first && act({ type: 'START_DAY' }) })
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
            Today · {tasks} {tasks === 1 ? 'task' : 'tasks'} · {human(totalMin * 60_000)} · {hm(start)}–{hm(start + totalMin)}
          </span>
          <button className="link quiet" onClick={() => go('plan')}>
            Edit plan
          </button>
        </div>
        <Progress />
      </div>

      <section className="focus" key={first.id}>
        <span className="eyebrow">{continuing ? 'Up next' : 'First up'}</span>
        <h1 className={`task-name ${nameSize(first.name)}`}>{first.name || (first.type === 'break' ? 'Break' : 'Untitled task')}</h1>
        {first.description && <p className="task-desc">{first.description}</p>}
        <div className="timer">
          <span className="timer-digits dim">{first.type === 'task' && !first.timed ? '00:00' : clock(first.duration * 60_000)}</span>
          <span className="timer-label">{n ? `Task ${n} of ${tasks}` : 'Break'}</span>
        </div>
      </section>

      <section className="controls">
        <button className="primary" onClick={() => act({ type: 'START_DAY' })} autoFocus>
          {continuing ? 'Continue' : 'Start day'}
        </button>
        <div className="secondary">
          <button className="link" onClick={() => go('day')}>
            Overview
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
        <span className="eyebrow">Nothing planned</span>
        <h1 className="task-name len-m">Plan the day once. Then just execute.</h1>
        <p className="task-desc">Add tasks and breaks in order. Planet shows you one at a time.</p>
      </section>
      <section className="controls">
        <button className="primary" onClick={() => go('plan')} autoFocus>
          Plan your day
        </button>
        <div className="secondary">
          <button className="link" onClick={() => act({ type: 'SET_BLOCKS', blocks: sampleBlocks(), startTime: '08:00' })}>
            Use a sample day
          </button>
        </div>
      </section>
    </main>
  )
}
