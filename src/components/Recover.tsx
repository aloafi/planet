import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { useCloud } from '../lib/cloud'
import { exportCode, hasContent, parseBackup, parseSchedule, readLocal } from '../lib/importer'
import { revive } from '../lib/engine'
import { minutesLabel } from '../lib/format'
import { go } from '../lib/route'
import { nBreaks, nTasks, t } from '../lib/i18n'
import type { AppState, Block } from '../lib/types'

/** where Planet used to live */
const OLD_ORIGIN = 'https://planet-plum.vercel.app'
const OLD_SITE = 'planet-plum.vercel.app'
/** addresses allowed to receive a browser's data from the old address */
const RECEIVERS = ['https://www.tryplanet.site', 'https://tryplanet.site']
const isReceiver = (o: string) => RECEIVERS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)
const isSender = (o: string) => o === OLD_ORIGIN || /^https:\/\/planet-[a-z0-9-]+\.vercel\.app$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)

type Found = { kind: 'backup'; state: AppState } | { kind: 'schedule'; blocks: Block[] }

export function Recover() {
  const params = new URLSearchParams(window.location.search)
  // opened by the new address to hand over this browser's data
  if (params.get('export') === '1' && window.opener) return <ExportBridge to={params.get('to') ?? ''} />
  return <RecoverPage />
}

function ExportBridge({ to }: { to: string }) {
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (!isReceiver(to)) return
    try {
      window.opener.postMessage({ type: 'planet-export', data: readLocal() }, to)
      setSent(true)
      window.setTimeout(() => window.close(), 600)
    } catch {
      /* opener gone */
    }
  }, [to])
  return (
    <main className="page">
      <header className="page-head">
        <span className="eyebrow">{t('recover')}</span>
        <h1 className="page-title">{sent ? t('sentBack', { site: new URL(to).host }) : '…'}</h1>
      </header>
    </main>
  )
}

function RecoverPage() {
  const { state, act } = useStore()
  const cloud = useCloud()
  const [found, setFound] = useState<Found | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  const onOld = window.location.origin === OLD_ORIGIN

  // the old address answers through postMessage
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!isSender(e.origin) || !e.data || e.data.type !== 'planet-export') return
      if (timer.current) window.clearTimeout(timer.current)
      setWaiting(false)
      const s = e.data.data ? revive(e.data.data, Date.now()) : null
      if (hasContent(s)) {
        setFound({ kind: 'backup', state: s! })
        setMsg(null)
      } else setMsg(t('nothingOld', { site: OLD_SITE }))
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])

  const fromOld = () => {
    setMsg(null)
    setFound(null)
    setDone(false)
    const w = window.open(`${OLD_ORIGIN}/re?export=1&to=${encodeURIComponent(window.location.origin)}`, 'planet-recover', 'width=420,height=520')
    if (!w) {
      setMsg(t('popupBlocked', { site: OLD_SITE }))
      return
    }
    setWaiting(true)
    timer.current = window.setTimeout(() => {
      setWaiting(false)
      setMsg(t('noReply', { site: OLD_SITE }))
    }, 15_000)
  }

  const readPaste = () => {
    setDone(false)
    const backup = parseBackup(text)
    if (backup && hasContent(backup)) {
      setFound({ kind: 'backup', state: backup })
      setMsg(null)
      return
    }
    const blocks = parseSchedule(text)
    if (blocks.length) {
      setFound({ kind: 'schedule', blocks })
      setMsg(null)
    } else {
      setFound(null)
      setMsg(t('unreadable'))
    }
  }

  const apply = (mode: 'restore' | 'replace' | 'append') => {
    if (!found) return
    if (found.kind === 'backup') act({ type: 'IMPORT_STATE', state: found.state })
    else if (mode === 'append') act({ type: 'APPEND_BLOCKS', blocks: found.blocks })
    else act({ type: 'SET_BLOCKS', blocks: found.blocks })
    setDone(true)
    setFound(null)
    setText('')
  }

  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(exportCode(state))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setText(exportCode(state))
    }
  }

  const blocks = found ? (found.kind === 'backup' ? found.state.plan.blocks : found.blocks) : []
  const summary = useMemo(() => {
    if (!found) return ''
    const tasks = blocks.filter((b) => b.type === 'task').length
    const breaks = blocks.filter((b) => b.type === 'break').length
    if (found.kind === 'schedule') return t('foundSchedule', { tasks: nTasks(tasks), breaks: nBreaks(breaks) })
    return t('foundBackup', { tasks: nTasks(tasks), breaks: nBreaks(breaks), templates: found.state.templates.length, days: found.state.history.length })
  }, [found, blocks])

  return (
    <main className="page recover">
      <header className="page-head">
        <span className="eyebrow">{t('recover')}</span>
        <h1 className="page-title">{t('recoverTitle')}</h1>
        <p className="page-sub">{t('recoverSub')}</p>
      </header>

      {!onOld && (
        <section className="rc-section">
          <h2 className="section-title">{t('fromOld')}</h2>
          <p className="section-note">{t('fromOldNote', { site: OLD_SITE })}</p>
          <div className="rc-row">
            <button className="primary compact" onClick={fromOld} disabled={waiting}>
              {waiting ? t('waiting', { site: OLD_SITE }) : t('recoverBtn', { site: OLD_SITE })}
            </button>
          </div>
        </section>
      )}

      <section className="rc-section">
        <h2 className="section-title">{t('paste')}</h2>
        <p className="section-note">{t('pasteNote')}</p>
        <textarea className="rc-paste" rows={6} value={text} placeholder={t('pastePlaceholder')} onChange={(e) => setText(e.target.value)} dir="auto" />
        <div className="rc-row">
          <button className="chip" onClick={readPaste} disabled={!text.trim()}>
            {t('read')}
          </button>
        </div>
      </section>

      {msg && <p className="rc-msg">{msg}</p>}

      {found && (
        <section className="rc-found">
          <p className="rc-found-title">{summary}</p>
          <ul className="rc-list">
            {blocks.slice(0, 12).map((b) => (
              <li key={b.id} className={`rc-${b.type}`}>
                <span dir="auto">{b.type === 'session' ? b.name || t('session') : b.name || (b.type === 'break' ? t('break') : t('untitled'))}</span>
                {b.type !== 'session' && <span className="rc-dur">{minutesLabel(b.duration)}</span>}
              </li>
            ))}
            {blocks.length > 12 && <li className="rc-more">{t('andMore', { n: blocks.length - 12 })}</li>}
          </ul>
          <p className="rc-save">{cloud.email ? t('savesToAccount', { email: cloud.email }) : t('savesLocal')}</p>
          <div className="rc-row">
            {found.kind === 'backup' ? (
              <button className="primary compact" onClick={() => apply('restore')}>{t('restore')}</button>
            ) : (
              <>
                <button className="primary compact" onClick={() => apply('replace')}>{t('replacePlan')}</button>
                {state.plan.blocks.length > 0 && (
                  <button className="link" onClick={() => apply('append')}>{t('addToPlan')}</button>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {done && (
        <section className="rc-found">
          <p className="rc-found-title">{t('restored')}</p>
          <div className="rc-row">
            <button className="primary compact" onClick={() => go('plan')}>{t('openPlan')}</button>
          </div>
        </section>
      )}

      <section className="rc-section rc-backup">
        <h2 className="section-title">{t('backupThis')}</h2>
        <p className="section-note">{t('backupNote')}</p>
        <div className="rc-row">
          <button className="chip" onClick={copyBackup} disabled={!hasContent(state)}>
            {t('copyBackup')}
          </button>
          {copied && <span className="saved">{t('backupCopied')}</span>}
        </div>
      </section>
    </main>
  )
}
