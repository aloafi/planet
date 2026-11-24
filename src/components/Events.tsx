import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../lib/store'
import { daysUntil, eventOf, todayKey, uid } from '../lib/engine'
import type { PlanEvent } from '../lib/types'

export function countdown(date: string, now: number) {
  const d = daysUntil(date, now)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d > 1) return `in ${d} days`
  if (d === -1) return 'yesterday'
  return `${-d} days ago`
}

/** " · Physics exam · in 12 days" — name isolated so Arabic names don't scramble the line */
export function EventTag({ ev, now }: { ev: PlanEvent | null; now: number }) {
  if (!ev) return null
  return (
    <span className="eyebrow-event">
      {' · '}
      <bdi>{ev.name}</bdi>
      {' · '}
      {countdown(ev.date, now)}
    </span>
  )
}

export function eventLine(ev: PlanEvent | null, now: number) {
  return ev ? `${ev.name} · ${countdown(ev.date, now)}` : null
}

/** "For: Physics exam · in 12 days" — opens the events sheet */
export function EventField() {
  const { state, now } = useStore()
  const [open, setOpen] = useState(false)
  const ev = eventOf(state, state.plan.eventId)
  return (
    <>
      <button className={`event-chip ${ev ? 'has-event' : ''}`} onClick={() => setOpen(true)}>
        <span className="event-ring" aria-hidden />
        {ev ? (
          <>
            <span className="event-name" dir="auto">{ev.name}</span>
            <span className="event-when">{countdown(ev.date, now)}</span>
          </>
        ) : (
          <span className="event-when">Link to an event</span>
        )}
      </button>
      {open && <EventsSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function EventsSheet({ onClose }: { onClose: () => void }) {
  const { state, now, act } = useStore()
  const [name, setName] = useState('')
  const [date, setDate] = useState(() => todayKey(now + 7 * 86_400_000))
  const [confirm, setConfirm] = useState<string | null>(null)
  const selected = state.plan.eventId ?? null

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const add = () => {
    const n = name.trim()
    if (!n || !date) return
    act({ type: 'ADD_EVENT', event: { id: uid(), name: n, date, createdAt: Date.now() }, attach: true })
    setName('')
  }

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Events" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Events</h2>
          <button className="link quiet" onClick={onClose}>Done</button>
        </div>
        <p className="sheet-note">An event is what today’s schedule works toward — an exam, a deadline, a launch.</p>

        <div className="ev-list" role="radiogroup" aria-label="Event for this plan">
          <button className={`ev-row ${selected === null ? 'on' : ''}`} role="radio" aria-checked={selected === null} onClick={() => act({ type: 'SET_PLAN_EVENT', id: null })}>
            <span className="ev-radio" aria-hidden />
            <span className="ev-text">
              <span className="ev-name">No event</span>
            </span>
          </button>
          {state.events.map((e) => {
            const d = daysUntil(e.date, now)
            return (
              <div key={e.id} className={`ev-row ${selected === e.id ? 'on' : ''} ${d < 0 ? 'is-past' : ''}`}>
                <button className="ev-pick" role="radio" aria-checked={selected === e.id} onClick={() => act({ type: 'SET_PLAN_EVENT', id: e.id })}>
                  <span className="ev-radio" aria-hidden />
                  <span className="ev-text">
                    <span className="ev-name" dir="auto">{e.name}</span>
                    <span className="ev-meta">
                      {new Date(e.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {countdown(e.date, now)}
                    </span>
                  </span>
                </button>
                {confirm === e.id ? (
                  <span className="confirm">
                    <button className="link danger" onClick={() => act({ type: 'DELETE_EVENT', id: e.id })}>Delete</button>
                    <button className="link quiet" onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="link quiet" onClick={() => setConfirm(e.id)} aria-label={`Delete ${e.name}`}>Delete</button>
                )}
              </div>
            )
          })}
        </div>

        <div className="group">
          <h3>New event</h3>
          <div className="ev-form">
            <input value={name} placeholder="e.g. Physics exam" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} maxLength={60} aria-label="Event name" dir="auto" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Event date" />
            <button className="chip solid" onClick={add} disabled={!name.trim() || !date}>Add event</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
