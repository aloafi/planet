import { useStore } from '../lib/store'
import { summaryOf } from '../lib/engine'
import { human, signed } from '../lib/format'
import { go } from '../lib/route'
import { planetFx } from '../lib/fx'
import { RecapCard, ShareButton } from './Insights'
import { fmtDate, t } from '../lib/i18n'
import { EventTag } from './Events'
import { eventOf } from '../lib/engine'

export function Summary() {
  const { state, now, act } = useStore()
  const s = summaryOf(state, now)
  const { run } = state
  const done = run.phase === 'done'
  const left = [...s.skipped.map((b) => ({ b, why: t('skipped') })), ...s.incomplete.map((b) => ({ b, why: done ? t('notFinished') : t('notStarted') }))]
  const ordered = state.plan.blocks.filter((b) => left.some((l) => l.b.id === b.id)).map((b) => left.find((l) => l.b.id === b.id)!)

  const headline = !done ? t('soFar') : s.total === 0 ? t('dayComplete') : s.percent === 100 ? t('allDone') : run.endedEarly ? t('sessionEnded') : t('dayComplete')

  return (
    <main className="page summary">
      <header className="page-head">
        <span className="eyebrow">
          {fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}
          <EventTag ev={eventOf(state, state.plan.eventId)} now={now} />
        </span>
        <h1 className="page-title">{headline}</h1>
        {Math.abs(s.bankMs) >= 60_000 && (
          <p className={`page-sub bank-line ${s.bankMs > 0 ? 'is-ahead' : 'is-behind'}`}>
            {s.bankMs > 0 ? t('savedLine', { t: signed(s.bankMs) }) : t('overLine', { t: signed(s.bankMs) })}
          </p>
        )}
      </header>

      <div className="stats">
        <Stat value={`${s.completed}`} unit={`/ ${s.total}`} label={t('tasksCompleted')} />
        <Stat value={`${s.percent}`} unit="%" label={t('completion')} />
        <Stat value={human(s.focusedMs)} label={t('focusedTime')} />
        <Stat value={human(s.breakMs)} label={t('breakTime')} />
      </div>

      {ordered.length > 0 && (
        <section className="leftover">
          <h2 className="section-title">{t('leftover')}</h2>
          <ul className="leftover-list">
            {ordered.map(({ b, why }) => (
              <li key={b.id}>
                <span className="leftover-name">{b.name || t('untitled')}</span>
                <span className="leftover-why">{why}</span>
                <button className="link" onClick={(e) => {
                  planetFx('launch', e.currentTarget)
                  act({ type: 'JUMP_TO', id: b.id })
                  go('now')
                }}>
                  {t('doNow')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RecapCard />

      <div className="page-actions">
        {done ? (
          <>
            <button className="primary compact" onClick={(e) => {
              planetFx('launch', e.currentTarget)
              act({ type: 'RESET_DAY' })
              go('now')
            }}>
              {t('newDay')}
            </button>
            <ShareButton />
            <button className="link" onClick={() => go('plan')}>
              {t('editPlan')}
            </button>
          </>
        ) : (
          <button className="link" onClick={() => go('now')}>
            {t('backToCurrentTask')}
          </button>
        )}
      </div>
    </main>
  )
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
