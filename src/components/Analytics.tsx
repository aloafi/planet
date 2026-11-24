import { useStore } from '../lib/store'
import { hms, statsOf } from '../lib/analytics'
import { human, signed } from '../lib/format'
import { fmtDate, t } from '../lib/i18n'

/** Plain numbers, big and readable: what you've done since you started. */
export function Analytics() {
  const { state, now } = useStore()
  const s = statsOf(state, now)
  const empty = s.focusMs < 1000 && s.tasksDone === 0

  if (empty) {
    return (
      <main className="page">
        <header className="page-head">
          <span className="eyebrow">{t('analytics')}</span>
          <h1 className="page-title">{t('noStats')}</h1>
          <p className="page-sub">{t('noStatsNote')}</p>
        </header>
      </main>
    )
  }

  const total = hms(s.focusMs)
  const pct = s.tasksPlanned ? Math.round((s.tasksDone / s.tasksPlanned) * 100) : 0
  const weekMax = Math.max(...s.week.map((d) => d.ms), 1)
  const topMax = Math.max(...s.topTasks.map((x) => x.ms), 1)

  return (
    <main className="page analytics">
      <header className="page-head">
        <span className="eyebrow">{t('analytics')}</span>
        <h1 className="page-title">{t('analyticsTitle')}</h1>
        {s.firstDate && <p className="page-sub">{t('sinceStart', { date: fmtDate(new Date(s.firstDate + 'T00:00'), { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
      </header>

      {/* the big one: total focus as hours · minutes · seconds */}
      <section className="an-hero">
        <span className="an-label">{t('totalFocus')}</span>
        <div className="an-clock" dir="ltr">
          <Unit n={total.h} label={t('hours')} />
          <span className="an-sep">:</span>
          <Unit n={total.m} label={t('minutes')} pad />
          <span className="an-sep">:</span>
          <Unit n={total.s} label={t('seconds')} pad />
        </div>
      </section>

      <section className="an-grid">
        <Tile value={String(s.tasksDone)} label={t('tasksDoneLabel')} note={t('ofPlanned', { n: s.tasksPlanned })} />
        <Tile value={`${pct}%`} label={t('completionRate')} />
        <Tile value={String(s.activeDays)} label={t('activeDaysLabel')} />
        <Tile value={human(s.avgFocusMs)} label={t('avgDay')} />
        <Tile
          value={Math.abs(s.savedMs) >= 60_000 ? signed(s.savedMs) : '0'}
          label={t('savedTotal')}
          note={s.savedMs < 0 ? t('overNote') : t('savedNote')}
        />
        <Tile value={human(s.breakMs)} label={t('breakTotal')} />
        {s.bestDay && (
          <Tile value={human(s.bestDay.ms)} label={t('bestDayLabel')} note={fmtDate(new Date(s.bestDay.date + 'T00:00'), { weekday: 'long', day: 'numeric', month: 'short' })} />
        )}
        {s.longestTask && <Tile value={human(s.longestTask.ms)} label={t('longestTaskLabel')} note={s.longestTask.name} />}
        <Tile value={String(s.skipped)} label={t('skippedLabel')} />
      </section>

      <section className="an-section">
        <h2 className="section-title">{t('last7')}</h2>
        <p className="section-note">{t('focusPerDay')}</p>
        <div className="an-week" role="list">
          {s.week.map((d) => (
            <div key={d.date} className={`an-day ${d.today ? 'is-today' : ''}`} role="listitem" aria-label={`${d.date}: ${human(d.ms)}`}>
              <span className="an-day-val">{d.ms >= 60_000 ? human(d.ms) : '–'}</span>
              <div className="an-bar-track">
                <div className="an-bar" style={{ height: `${Math.max(d.ms > 0 ? 4 : 0, (d.ms / weekMax) * 100)}%` }} />
              </div>
              <span className="an-day-name">{fmtDate(new Date(d.date + 'T00:00'), { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </section>

      {s.topTasks.length > 0 && (
        <section className="an-section">
          <h2 className="section-title">{t('whereTime')}</h2>
          <ul className="an-top">
            {s.topTasks.map((x) => (
              <li key={x.name}>
                <div className="an-top-line">
                  <span className="an-top-name" dir="auto">{x.name}</span>
                  <span className="an-top-time">{human(x.ms)}</span>
                </div>
                <div className="an-hbar-track">
                  <div className="an-hbar" style={{ width: `${(x.ms / topMax) * 100}%` }} />
                </div>
                {x.count > 0 && <span className="an-top-count">{t('timesDone', { n: x.count })}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="an-foot">{t('statsNote')}</p>
    </main>
  )
}

function Unit({ n, label, pad }: { n: number; label: string; pad?: boolean }) {
  return (
    <span className="an-unit">
      <span className="an-num">{pad ? String(n).padStart(2, '0') : n}</span>
      <span className="an-unit-label">{label}</span>
    </span>
  )
}

function Tile({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="an-tile">
      <span className="an-tile-value">{value}</span>
      <span className="an-tile-label">{label}</span>
      {note && <span className="an-tile-note" dir="auto">{note}</span>}
    </div>
  )
}
