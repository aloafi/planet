import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { go, type Route } from '../lib/route'
import type { Settings as S } from '../lib/types'
import { t } from '../lib/i18n'
import { AuthButtons } from './Account'

export function Nav({ route, onSettings }: { route: Route; onSettings: () => void }) {
  const items: [Route, string][] = [
    ['now', t('now')],
    ['plan', t('plan')],
    ['day', t('day')],
    ['stats', t('analytics')],
  ]
  const active = route === 'summary' ? 'day' : route
  return (
    <header className={`nav ${route === 'now' ? 'nav-quiet' : ''}`}>
      <button className="wordmark" onClick={() => go('now')} aria-label={t('currentTask')}>
        <span className="brand-logo" aria-hidden />
      </button>
      <nav className="nav-links" aria-label="Main">
        {items.map(([r, l]) => (
          <button key={r} className={active === r ? 'on' : ''} aria-current={active === r ? 'page' : undefined} onClick={() => go(r)}>
            {r === 'stats' ? (
              <>
                <span className="nl-full">{l}</span>
                <span className="nl-short">{t('analyticsShort')}</span>
              </>
            ) : (
              l
            )}
          </button>
        ))}
        <button className="nav-settings" onClick={onSettings} aria-label={t('settings')}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
            <circle cx="13" cy="6" r="2" />
            <circle cx="7" cy="14" r="2" />
          </svg>
        </button>
        <AuthButtons />
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
      <button className="link" onClick={doUndo}>{t('undo')}</button>
      <button className="link quiet" onClick={dismissUndo} aria-label={t('dismiss')}>×</button>
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
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t('settings')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{t('settings')}</h2>
          <button className="link quiet" onClick={onClose}>{t('close')}</button>
        </div>

        <Group title={t('flow')}>
          <Toggle label={t('autoStart')} note={t('autoStartNote')} on={s.autoStartNext} onChange={(v) => set({ autoStartNext: v })} />
          <Choice
            label={t('whenBreakEnds')}
            value={s.breakEnd}
            options={[
              ['auto', t('startNextTask')],
              ['wait', t('waitForMe')],
            ]}
            onChange={(v) => set({ breakEnd: v as S['breakEnd'] })}
          />
          <Choice
            label={t('whenTaskEnds')}
            note={t('whenTaskEndsNote')}
            value={s.taskEnd}
            options={[
              ['ask', t('askMe')],
              ['overtime', t('keepCounting')],
            ]}
            onChange={(v) => set({ taskEnd: v as S['taskEnd'] })}
          />
        </Group>

        <Group title={t('alerts')}>
          <Toggle label={t('chime')} on={s.sound} onChange={(v) => set({ sound: v })} />
          <Toggle
            label={t('notify')}
            note={perm === 'denied' ? t('notifyBlocked') : perm === 'unsupported' ? t('notifyUnsupported') : t('notifyNote')}
            on={s.notify}
            disabled={perm === 'denied' || perm === 'unsupported'}
            onChange={toggleNotify}
          />
          <Toggle label={t('wake')} on={s.wakeLock} onChange={(v) => set({ wakeLock: v })} />
        </Group>

        <Group title={t('ai')}>
          <Toggle label={t('aiInsights')} note={t('aiNote')} on={s.ai} onChange={(v) => set({ ai: v })} />
        </Group>

        <Group title={t('appearance')}>
          <Choice
            label={t('language')}
            value={s.lang}
            options={[
              ['en', 'English'],
              ['ar', 'العربية'],
            ]}
            onChange={(v) => set({ lang: v as S['lang'] })}
          />
          <Choice
            label={t('theme')}
            value={s.theme}
            options={[
              ['dark', t('dark')],
              ['light', t('light')],
            ]}
            onChange={(v) => set({ theme: v as S['theme'] })}
          />
          <Toggle label={t('transitions')} note={t('transitionsNote')} on={s.motion} onChange={(v) => set({ motion: v })} />
        </Group>

        <Group title={t('keyboard')}>
          <dl className="keys">
            <dt>Enter</dt>
            <dd>{t('kFinish')}</dd>
            <dt>Space</dt>
            <dd>{t('kPause')}</dd>
            <dt>E</dt>
            <dd>{t('kExtend')}</dd>
            <dt>S</dt>
            <dd>{t('kSkip')}</dd>
          </dl>
        </Group>

        <p className="sheet-foot">{t('settingsFoot')}</p>
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
