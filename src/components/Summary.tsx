import { useStore } from '../lib/store'
import { summaryOf } from '../lib/engine'
import { human } from '../lib/format'
import { go } from '../lib/route'

export function Summary() {
  const { state, now, act } = useStore()
  const s = summaryOf(state, now)
  const { run } = state
  const done = run.phase === 'done'
  const left = [...s.skipped.map((b) => ({ b, why: 'Skipped' })), ...s.incomplete.map((b) => ({ b, why: done ? 'Not finished' : 'Not started' }))]
  const ordered = state.plan.blocks.filter((b) => left.some((l) => l.b.id === b.id)).map((b) => left.find((l) => l.b.id === b.id)!)

  const headline = !done ? 'So far today.' : s.total === 0 ? 'Day complete.' : s.percent === 100 ? 'Everything done.' : run.endedEarly ? 'Day ended.' : 'Day complete.'

  return (
    <main className="page summary">
      <header className="page-head">
        <span className="eyebrow">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <h1 className="page-title">{headline}</h1>
      </header>

      <div className="stats">
        <Stat value={`${s.completed}`} unit={`/ ${s.total}`} label="Tasks completed" />
        <Stat value={`${s.percent}`} unit="%" label="Completion" />
        <Stat value={human(s.focusedMs)} label="Focused time" />
        <Stat value={human(s.breakMs)} label="Break time" />
      </div>

      {ordered.length > 0 && (
        <section className="leftover">
          <h2 className="section-title">Skipped or left incomplete</h2>
          <ul className="leftover-list">
            {ordered.map(({ b, why }) => (
              <li key={b.id}>
                <span className="leftover-name">{b.name || 'Untitled task'}</span>
                <span className="leftover-why">{why}</span>
                <button className="link" onClick={() => {
                  act({ type: 'JUMP_TO', id: b.id })
                  go('now')
                }}>
                  Do now
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="page-actions">
        {done ? (
          <>
            <button className="primary compact" onClick={() => {
              act({ type: 'RESET_DAY' })
              go('now')
            }}>
              Start a new day
            </button>
            <button className="link" onClick={() => go('plan')}>
              Edit plan
            </button>
          </>
        ) : (
          <button className="link" onClick={() => go('now')}>
            Back to current task
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
