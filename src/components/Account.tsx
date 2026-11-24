import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useCloud } from '../lib/cloud'
import { t } from '../lib/i18n'

type Mode = 'in' | 'up' | 'forgot' | 'reset'

/** top-right: Sign in · Sign up, or your account once signed in */
export function AuthButtons() {
  const cloud = useCloud()
  const [open, setOpen] = useState<Mode | 'account' | null>(null)

  useEffect(() => {
    if (cloud.recovery) setOpen('reset')
  }, [cloud.recovery])

  return (
    <>
      {cloud.session ? (
        <button className={`acct sync-${cloud.status}`} onClick={() => setOpen('account')} aria-label={t('account')} title={cloud.email ?? ''}>
          <span className="acct-initial" aria-hidden>{(cloud.email ?? '?').slice(0, 1).toUpperCase()}</span>
          <span className="acct-dot" aria-hidden />
        </button>
      ) : (
        <span className="auth-links">
          <button className="auth-in" onClick={() => setOpen('in')}>{t('navSignIn')}</button>
          <button className="auth-up" onClick={() => setOpen('up')}>{t('navSignUp')}</button>
        </span>
      )}
      {open === 'account' && <AccountSheet onClose={() => setOpen(null)} />}
      {open && open !== 'account' && (
        <AuthDialog
          mode={open}
          onMode={setOpen}
          onClose={() => {
            setOpen(null)
            cloud.clearRecovery()
          }}
        />
      )}
    </>
  )
}

function AuthDialog({ mode, onMode, onClose }: { mode: Mode; onMode: (m: Mode) => void; onClose: () => void }) {
  const cloud = useCloud()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setNote(null)
  }, [mode])
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)
    if (mode === 'in') {
      const err = await cloud.signIn(email, password)
      if (err) setError(err === 'Invalid login credentials' ? t('authError') : err)
      else onClose()
    } else if (mode === 'up') {
      const { error: err, confirm } = await cloud.signUp(email, password)
      if (err) setError(err)
      else if (confirm) setNote(t('confirmSent'))
      else onClose()
    } else if (mode === 'forgot') {
      const err = await cloud.resetPassword(email)
      if (err) setError(err)
      else setNote(t('resetSent'))
    } else {
      const err = await cloud.setPassword(password)
      if (err) setError(err)
      else {
        setNote(t('passwordSet'))
        window.setTimeout(onClose, 900)
      }
    }
    setBusy(false)
  }

  const title = mode === 'in' ? t('signIn') : mode === 'up' ? t('createAccount') : mode === 'forgot' ? t('forgot') : t('setPassword')
  const action = mode === 'in' ? t('signIn') : mode === 'up' ? t('signUp') : mode === 'forgot' ? t('sendReset') : t('setPassword')

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="auth" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <img className="auth-logo" src="/brand/planet-mark.png" alt="" aria-hidden />
        <h2>{title}</h2>
        {(mode === 'in' || mode === 'up') && <p className="auth-note">{t('authNote')}</p>}

        {mode !== 'reset' && (
          <label className="field">
            <span>{t('email')}</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoFocus />
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="field">
            <span>{mode === 'reset' ? t('newPassword') : t('password')}</span>
            <input
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              autoFocus={mode === 'reset'}
            />
            {mode !== 'in' && <small className="auth-hint">{t('passwordHint')}</small>}
          </label>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        {note && <p className="auth-ok" role="status">{note}</p>}

        <button className="primary compact auth-submit" type="submit" disabled={busy}>
          {busy ? '…' : action}
        </button>

        <div className="auth-switch">
          {mode === 'in' && (
            <>
              <button type="button" className="link quiet" onClick={() => onMode('forgot')}>{t('forgot')}</button>
              <span>
                {t('noAccount')} <button type="button" className="link" onClick={() => onMode('up')}>{t('signUp')}</button>
              </span>
            </>
          )}
          {mode === 'up' && (
            <span>
              {t('haveAccount')} <button type="button" className="link" onClick={() => onMode('in')}>{t('signIn')}</button>
            </span>
          )}
          {mode === 'forgot' && (
            <button type="button" className="link" onClick={() => onMode('in')}>{t('backToSignIn')}</button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  )
}

function AccountSheet({ onClose }: { onClose: () => void }) {
  const cloud = useCloud()
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  const statusText =
    cloud.status === 'saved'
      ? t('syncSaved')
      : cloud.status === 'syncing'
        ? t('syncSyncing')
        : cloud.status === 'offline'
          ? t('syncOffline')
          : cloud.status === 'error'
            ? t('syncError')
            : ''
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="auth" role="dialog" aria-modal="true" aria-label={t('account')} onClick={(e) => e.stopPropagation()}>
        <img className="auth-logo" src="/brand/planet-mark.png" alt="" aria-hidden />
        <h2>{t('account')}</h2>
        <p className="acct-email" dir="ltr">{cloud.email}</p>
        <p className={`acct-status sync-${cloud.status}`}>
          <span className="acct-dot" aria-hidden />
          {statusText}
        </p>
        <p className="auth-note">{t('accountNote')}</p>
        <div className="auth-switch">
          <button className="link" onClick={cloud.syncNow}>{t('syncNow')}</button>
          <button
            className="link danger"
            onClick={async () => {
              await cloud.signOut()
              onClose()
            }}
          >
            {t('signOut')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
