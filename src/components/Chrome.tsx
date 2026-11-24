import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { go, type Route } from '../lib/route'
import type { Settings as S } from '../lib/types'

export function Nav({ route, onSettings }: { route: Route; onSettings: () => void }) {
  const items: [Route, string][] = [
    ['now', 'Now'],
    ['plan', 'Plan'],
    ['day', 'Day'],
  ]
  const active = route === 'summary' ? 'day' : route
  return (
    <header className={`nav ${route === 'now' ? 'nav-quiet' : ''}`}>
      <button className="wordmark" onClick={() => go('now')} aria-label="Planet — current task">
        <span className="wordmark-dot" aria-hidden />
        planet
      </button>
      <nav className="nav-links" aria-label="Main">
        {items.map(([r, l]) => (
          <button key={r} className={active === r ? 'on' : ''} aria-current={active === r ? 'page' : undefined} onClick={() => go(r)}>
            {l}
          </button>
        ))}
        <button className="nav-settings" onClick={onSettings} aria-label="Settings">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
            <circle cx="13" cy="6" r="2" />
            <circle cx="7" cy="14" r="2" />
          </svg>
        </button>
      </nav>
    </header>
  )
}

export function UndoToast() {
  const { undo, doUndo, dismissUndo } = useStore()
  if (!undo) return null
  return (
    <div className="toast" role="status" key={undo.id}>
      <span>{undo.label}</span>
      <button className="link" onClick={doUndo}>Undo</button>
      <button className="link quiet" onClick={dismissUndo} aria-label="Dismiss">×</button>
    </div>
  )
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { state, act } = useStore()
  const s = state.settings
  const set = (patch: Partial<S>) => act({ type: 'SETTINGS', patch })
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const toggleNotify = async () => {
    if (s.notify) return set({ notify: false })
    if (typeof Notification === 'undefined') return
    let p = Notification.permission
    if (p === 'default') p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') set({ notify: true })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Settings</h2>
          <button className="link quiet" onClick={onClose}>Close</button>
        </div>

        <Group title="Flow">
          <Toggle label="Start the next block automatically" note="After Finish or Skip, its timer starts right away." on={s.autoStartNext} onChange={(v) => set({ autoStartNext: v })} />
          <Choice
            label="When a break ends"
            value={s.breakEnd}
            options={[
              ['auto', 'Start next task'],
              ['wait', 'Wait for me'],
            ]}
            onChange={(v) => set({ breakEnd: v as S['breakEnd'] })}
          />
          <Choice
            label="When a task’s time is up"
            note="A task is never marked done just because time ran out."
            value={s.taskEnd}
            options={[
              ['ask', 'Ask me'],
              ['overtime', 'Keep counting'],
            ]}
            onChange={(v) => set({ taskEnd: v as S['taskEnd'] })}
          />
        </Group>

        <Group title="Alerts">
          <Toggle label="Chime when time is up" on={s.sound} onChange={(v) => set({ sound: v })} />
          <Toggle
            label="Notification when time is up"
            note={perm === 'denied' ? 'Blocked in your browser settings.' : perm === 'unsupported' ? 'Not supported in this browser.' : 'Only while this tab is in the background.'}
            on={s.notify}
            disabled={perm === 'denied' || perm === 'unsupported'}
            onChange={toggleNotify}
          />
          <Toggle label="Keep screen awake while a timer runs" on={s.wakeLock} onChange={(v) => set({ wakeLock: v })} />
        </Group>

        <Group title="Appearance">
          <Choice
            label="Theme"
            value={s.theme}
            options={[
              ['dark', 'Dark'],
              ['light', 'Light'],
            ]}
            onChange={(v) => set({ theme: v as S['theme'] })}
          />
          <Toggle label="Planet transitions" note="Waves and planets when you start and finish." on={s.motion} onChange={(v) => set({ motion: v })} />
        </Group>

        <Group title="Keyboard">
          <dl className="keys">
            <dt>Enter</dt>
            <dd>Finish / start</dd>
            <dt>Space</dt>
            <dd>Pause / resume</dd>
            <dt>E</dt>
            <dd>Extend 5 min</dd>
            <dt>S</dt>
            <dd>Skip</dd>
          </dl>
        </Group>

        <p className="sheet-foot">Everything is saved on this device.</p>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Toggle({ label, note, on, onChange, disabled }: { label: string; note?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button className="setting" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="setting-text">
        <span>{label}</span>
        {note && <small>{note}</small>}
      </span>
      <span className={`switch ${on ? 'on' : ''}`} aria-hidden>
        <span />
      </span>
    </button>
  )
}

function Choice({ label, note, value, options, onChange }: { label: string; note?: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="setting setting-choice">
      <span className="setting-text">
        <span>{label}</span>
        {note && <small>{note}</small>}
      </span>
      <div className="segment" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
