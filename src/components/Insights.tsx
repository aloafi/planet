import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../lib/store'
import { AIError, aiErrorText, forecastPlan, recapDay } from '../lib/ai'
import { dayLogOf, eventOf, planKey, tasksOf } from '../lib/engine'
import { renderDayCard } from '../lib/shareCard'
import { eventLine } from './Events'
import { fmtDate, t } from '../lib/i18n'

/* ---------- forecast (Plan screen) ---------- */

export function ForecastCard() {
  const { state, now, act } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const key = planKey(state)
  const f = state.forecast
  const stale = !!f && f.key !== key

  if (!state.settings.ai || tasksOf(state.plan).length === 0) return null

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      act({ type: 'SET_FORECAST', forecast: await forecastPlan(state, now, key) })
    } catch (e) {
      setErr(aiErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!f && !busy) {
    return (
      <div className="ai-row">
        <span className="ai-q">{eventOf(state, state.plan.eventId) ? t('forecastEventQ') : t('forecastQ')}</span>
        <button className="link" onClick={run}>{t('forecast')}</button>
        {err && <p className="ai-err">{err}</p>}
      </div>
    )
  }

  return (
    <section className={`ai-card ${stale ? 'is-stale' : ''}`} aria-busy={busy}>
      <header className="ai-head">
        <span className="ai-tag">
            {stale ? t('forecastStale') : t('ifYouFollow')}
        </span>
        <button className="link quiet" onClick={run} disabled={busy}>
          {busy ? t('thinking') : stale ? t('update') : t('refresh')}
        </button>
      </header>
      {busy && !f ? (
        <Shimmer />
      ) : f ? (
        <div dir="auto">
          <p className="ai-headline">{f.headline}</p>
          {f.outcomes.length > 0 && (
            <ul className="ai-list">
              {f.outcomes.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
          {f.tip && <p className="ai-tip">{f.tip}</p>}
        </div>
      ) : null}
      {err && <p className="ai-err">{err}</p>}
    </section>
  )
}

/* ---------- recap (end of day) ---------- */

export function RecapCard() {
  const { state, now, act } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const tried = useRef<string | null>(null)
  const recap = state.run.recap
  const done = state.run.phase === 'done'

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await recapDay(state, now, dayLogOf(state, now))
      act({ type: 'SET_RECAP', recap: r })
    } catch (e) {
      setErr(aiErrorText(e))
      if (e instanceof AIError && e.code === 'no_key') tried.current = state.run.id
    } finally {
      setBusy(false)
    }
  }

  // write the recap once, automatically, when the day is finished
  useEffect(() => {
    if (!done || !state.settings.ai || recap || tried.current === state.run.id) return
    tried.current = state.run.id
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, state.settings.ai, recap, state.run.id])

  if (!state.settings.ai || !done) return null

  return (
    <section className="ai-card recap" aria-busy={busy}>
      <header className="ai-head">
        <span className="ai-tag">
            {t('yourDay')}
        </span>
        {(recap || err) && (
          <button className="link quiet" onClick={run} disabled={busy}>
            {busy ? t('writing') : recap ? t('rewrite') : t('tryAgain')}
          </button>
        )}
      </header>
      {busy && !recap ? (
        <Shimmer label={t('readingDay')} />
      ) : recap ? (
        <div dir="auto">
          <p className="ai-headline">{recap.title}</p>
          <p className="ai-story">{recap.story}</p>
          {recap.next && (
            <p className="ai-tip">
              <span className="ai-next">{t('tomorrowLabel')}</span> {recap.next}
            </p>
          )}
        </div>
      ) : null}
      {err && <p className="ai-err">{err}</p>}
    </section>
  )
}

function Shimmer({ label }: { label?: string }) {
  return (
    <div className="shimmer" role="status">
      <span className="sr">{label ?? t('readingPlan')}</span>
      <i style={{ width: '70%' }} />
      <i style={{ width: '92%' }} />
      <i style={{ width: '56%' }} />
    </div>
  )
}

/* ---------- share the day as an image ---------- */

export function ShareButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="chip" onClick={() => setOpen(true)}>{t('shareImage')}</button>
      {open && <ShareSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function ShareSheet({ onClose }: { onClose: () => void }) {
  const { state, now } = useStore()
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const file = `planet-${state.run.date}.png`

  useEffect(() => {
    let alive = true
    const log = dayLogOf(state, now)
    renderDayCard({
      log,
      eventLine: eventLine(eventOf(state, log.eventId), now),
      dateLine: fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' }),
    })
      .then((b) => {
        if (!alive) return
        setBlob(b)
        setUrl(URL.createObjectURL(b))
      })
      .catch(() => setNote(t('drawFailed')))
    return () => {
      alive = false
    }
    // render once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const f = blob ? new File([blob], file, { type: 'image/png' }) : null
  const canShare = !!f && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] })
  const canCopy = !!blob && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

  const share = async () => {
    if (!f) return
    try {
      await navigator.share({ files: [f], title: t('shareTitle') })
    } catch {
      /* cancelled */
    }
  }
  const copy = async () => {
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setNote(t('copied'))
    } catch {
      setNote(t('copyBlocked'))
    }
  }

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="share" role="dialog" aria-modal="true" aria-label={t('shareDialog')} onClick={(e) => e.stopPropagation()}>
        <div className="share-img">{url ? <img src={url} alt={t('yourDayImage')} /> : <div className="share-wait">{t('drawing')}</div>}</div>
        <div className="share-actions">
          {canShare && (
            <button className="chip solid" onClick={share}>{t('share')}</button>
          )}
          {url && (
            <a className={`chip ${canShare ? '' : 'solid'}`} href={url} download={file}>{t('download')}</a>
          )}
          {canCopy && (
            <button className="chip" onClick={copy}>{t('copy')}</button>
          )}
          <button className="link quiet" onClick={onClose}>{t('close')}</button>
        </div>
        {note && <p className="share-note">{note}</p>}
      </div>
    </div>,
    document.body,
  )
}
