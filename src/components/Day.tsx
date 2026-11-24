import { useState } from 'react'
import { useStore } from '../lib/store'
import { bankOf, progressOf, scheduleOf, sessionBlocks, sessionNumber, statusOf } from '../lib/engine'
import { hm, human, minutesLabel, signed } from '../lib/format'
import { go } from '../lib/route'
import { planetFx } from '../lib/fx'
import { EventTag } from './Events'
import { nTasks, t } from '../lib/i18n'
import { eventOf } from '../lib/engine'

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
          <span className="eyebrow">{t('overview')}</span>
          <h1 className="page-title">{t('nothingYet')}</h1>
        </header>
        <div className="page-actions">
          <button className="primary compact" onClick={() => go('plan')}>{t('planYourDay')}</button>
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
        <span className="eyebrow">{t('overview')}<EventTag ev={eventOf(state, plan.eventId)} now={now} /></span>
        <h1 className="page-title">{t('todayTitle')}</h1>
        <p className="page-sub">
          {t('dayProgress', { done: p.completed, total: p.total, pct: Math.round(p.ratio * 100) })}
          {(() => {
            const bk = bankOf(state, now)
            return bk.counted && Math.abs(bk.ms) >= 1000 ? (
              <span className={bk.ms > 0 ? 'is-ahead' : 'is-behind'}> · {signed(bk.ms)} {bk.ms > 0 ? t('saved') : t('behind')}</span>
            ) : null
          })()}
        </p>
        <div className="progress page-progress">
          <div className="progress-fill" style={{ transform: `scaleX(${p.ratio})` }} />
        </div>
      </header>

      <ol className="timeline">
        {sched.map(({ block: b, start }) => {
          if (b.type === 'session') {
            const members = sessionBlocks(plan, b.id)
            const mins = members.reduce((a, x) => a + x.duration, 0)
            return (
              <li key={b.id} className="tl-session">
                <span className="tl-session-name">{b.name.trim() || t('sessionN', { n: sessionNumber(plan, b.id) })}</span>
                <span className="tl-session-meta">
                  {t('sessionMeta', { tasks: nTasks(members.filter((x) => x.type === 'task').length), time: human(mins * 60_000) })}
                </span>
              </li>
            )
          }
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
                <span className="tl-time" dir="ltr">{hm(start)}</span>
                <span className="tl-mark" aria-hidden />
                <span className="tl-name">{b.type === 'break' ? b.name || t('break') : b.name || t('untitled')}</span>
                <span className="tl-dur">{b.type === 'task' && !b.timed ? t('untimed') : minutesLabel(b.duration)}</span>
                <span className="tl-state">{label(v, b.type)}</span>
              </button>
              {isOpen && (
                <div className="tl-actions">
                  <button className="link" onClick={(e) => {
                    planetFx('launch', e.currentTarget, b.type === 'break' ? 'break' : 'task')
                    act({ type: 'JUMP_TO', id: b.id })
                    go('now')
                  }}>
                    {b.type === 'break' ? t('takeBreakNow') : t('doThisNow')}
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
            {Object.keys(run.records).length ? t('continue') : t('startDay')}
          </button>
        )}
        {run.phase === 'active' && (
          <button className="primary compact" onClick={() => go('now')}>{t('backToCurrent')}</button>
        )}
        {run.phase === 'done' && (
          <button className="primary compact" onClick={() => go('summary')}>{t('viewSummary')}</button>
        )}
        {run.phase === 'active' &&
          (confirmEnd ? (
            <span className="confirm">
              {t('endSessionNowQ')}
              <button className="link danger" onClick={() => {
                act({ type: 'END_DAY' })
                setConfirmEnd(false)
                go('summary')
              }}>{t('endSession')}</button>
              <button className="link quiet" onClick={() => setConfirmEnd(false)}>{t('cancel')}</button>
            </span>
          ) : (
            <button className="link" onClick={() => setConfirmEnd(true)}>{t('endSession')}</button>
          ))}
        {run.phase === 'active' && (
          <button className="link quiet" onClick={() => go('summary')}>
            {t('summarySoFar')}
          </button>
        )}
      </div>
    </main>
  )
}

function label(v: Visual, type: 'task' | 'break' | 'session') {
  if (v === 'completed') return type === 'break' ? t('taken') : t('completed')
  if (v === 'current') return t('nowState')
  if (v === 'skipped') return t('skipped')
  return ''
}
