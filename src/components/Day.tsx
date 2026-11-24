import { useState } from 'react'
import { useStore } from '../lib/store'
import { bankOf, progressOf, scheduleOf, statusOf } from '../lib/engine'
import { hm, minutesLabel, signed } from '../lib/format'
import { go } from '../lib/route'
import { planetFx } from '../lib/fx'

type Visual = 'completed' | 'current' | 'upcoming' | 'skipped'

export function Day() {
  const { state, act, now } = useStore()
  const { plan, run } = state
  const [open, setOpen] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const p = progressOf(state)
  const sched = scheduleOf(plan)

  if (plan.blocks.length === 0) {
    return (
      <main className="page">
        <header className="page-head">
          <span className="eyebrow">Overview</span>
          <h1 className="page-title">Nothing planned yet.</h1>
        </header>
        <div className="page-actions">
          <button className="primary compact" onClick={() => go('plan')}>Plan your day</button>
        </div>
      </main>
    )
  }

  const visual = (id: string): Visual => {
    if (run.phase === 'active' && run.currentId === id) return 'current'
    const st = statusOf(run, id)
    return st === 'pending' ? 'upcoming' : st
  }

  return (
    <main className="page">
      <header className="page-head">
        <span className="eyebrow">Overview</span>
        <h1 className="page-title">Today</h1>
        <p className="page-sub">
          {p.completed} of {p.total} tasks completed · {Math.round(p.ratio * 100)}% handled
          {(() => {
            const bk = bankOf(state, now)
            return bk.counted && Math.abs(bk.ms) >= 1000 ? (
              <span className={bk.ms > 0 ? 'is-ahead' : 'is-behind'}> · {signed(bk.ms)} {bk.ms > 0 ? 'saved' : 'behind'}</span>
            ) : null
          })()}
        </p>
        <div className="progress page-progress">
          <div className="progress-fill" style={{ transform: `scaleX(${p.ratio})` }} />
        </div>
      </header>

      <ol className="timeline">
        {sched.map(({ block: b, start }) => {
          const v = visual(b.id)
          const canJump = v === 'upcoming' || v === 'skipped'
          const isOpen = open === b.id && canJump
          return (
            <li key={b.id} className={`tl-row tl-${b.type} is-${v} ${isOpen ? 'is-open' : ''}`}>
              <button
                className="tl-main"
                onClick={() => (v === 'current' ? go('now') : setOpen(isOpen ? null : b.id))}
                aria-expanded={canJump ? isOpen : undefined}
              >
                <span className="tl-time">{hm(start)}</span>
                <span className="tl-mark" aria-hidden />
                <span className="tl-name">{b.type === 'break' ? b.name || 'Break' : b.name || 'Untitled task'}</span>
                <span className="tl-dur">{b.type === 'task' && !b.timed ? 'Untimed' : minutesLabel(b.duration)}</span>
                <span className="tl-state">{label(v, b.type)}</span>
              </button>
              {isOpen && (
                <div className="tl-actions">
                  <button className="link" onClick={(e) => {
                    planetFx('launch', e.currentTarget, b.type === 'break' ? 'break' : 'task')
                    act({ type: 'JUMP_TO', id: b.id })
                    go('now')
                  }}>
                    {b.type === 'break' ? 'Take this break now' : 'Do this now'}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="page-actions">
        {run.phase === 'idle' && (
          <button className="primary compact" onClick={(e) => {
            planetFx('launch', e.currentTarget)
            act({ type: 'START_DAY' })
            go('now')
          }}>
            {Object.keys(run.records).length ? 'Continue' : 'Start day'}
          </button>
        )}
        {run.phase === 'active' && (
          <button className="primary compact" onClick={() => go('now')}>Back to current</button>
        )}
        {run.phase === 'done' && (
          <button className="primary compact" onClick={() => go('summary')}>View summary</button>
        )}
        {run.phase === 'active' &&
          (confirmEnd ? (
            <span className="confirm">
              End the session now?
              <button className="link danger" onClick={() => {
                act({ type: 'END_DAY' })
                setConfirmEnd(false)
                go('summary')
              }}>End session</button>
              <button className="link quiet" onClick={() => setConfirmEnd(false)}>Cancel</button>
            </span>
          ) : (
            <button className="link" onClick={() => setConfirmEnd(true)}>End session</button>
          ))}
        {run.phase === 'active' && (
          <button className="link quiet" onClick={() => go('summary')}>
            Summary so far
          </button>
        )}
      </div>
    </main>
  )
}

function label(v: Visual, type: 'task' | 'break') {
  if (v === 'completed') return type === 'break' ? 'Taken' : 'Completed'
  if (v === 'current') return 'Now'
  if (v === 'skipped') return 'Skipped'
  return ''
}
