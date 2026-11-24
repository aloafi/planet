import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { currentBlock, reducer, remainingOf, revive, type Action } from './engine'
import type { AppState, Block, Settings } from './types'
import { chime, unlockAudio } from './sound'
import { setFxEnabled } from './fx'
import { setLang, t } from './i18n'

const KEY = 'planet:v1'

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never
type Act = DistributiveOmit<Action, 'now'>

interface Undo {
  prev: AppState
  label: string
  id: number
}

interface Ctx {
  state: AppState
  now: number
  act: (a: Act) => void
  /** Finish/Skip/End break — remembers the previous state so it can be undone */
  step: (kind: 'FINISH' | 'SKIP', label: string) => void
  undo: Undo | null
  doUndo: () => void
  dismissUndo: () => void
}

const StoreCtx = createContext<Ctx | null>(null)

function load(): AppState {
  let raw: unknown = null
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    raw = null
  }
  return revive(raw, Date.now())
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  // language is read synchronously by t() and the formatters during this render
  setLang(state.settings.lang)
  const [now, setNow] = useState(() => Date.now())
  const [undo, setUndo] = useState<Undo | null>(null)
  const ref = useRef(state)
  ref.current = state

  const act = useCallback((a: Act) => {
    // any other change makes the last Finish/Skip no longer safely undoable
    if (a.type !== 'MARK_ALERTED' && a.type !== 'SETTINGS' && a.type !== 'KEEP_GOING') setUndo(null)
    dispatch({ ...a, now: Date.now() } as Action)
  }, [])

  const step = useCallback((kind: 'FINISH' | 'SKIP', label: string) => {
    const prev = ref.current
    dispatch({ type: kind, now: Date.now() })
    setUndo({ prev, label, id: Date.now() })
  }, [])

  const doUndo = useCallback(() => {
    setUndo((u) => {
      if (u) dispatch({ type: 'HYDRATE', state: u.prev })
      return null
    })
  }, [])
  const dismissUndo = useCallback(() => setUndo(null), [])

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage full or unavailable — keep running in memory */
    }
  }, [state])

  // keep several open tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return
      try {
        dispatch({ type: 'HYDRATE', state: revive(JSON.parse(e.newValue), Date.now()) })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // clock + time-based transitions
  const active = state.run.phase === 'active'
  useEffect(() => {
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const s = ref.current
      const b = currentBlock(s)
      if (b && s.run.timer.status === 'running' && !s.run.timer.alerted) {
        const rem = remainingOf(b, s.run.timer, t)
        if (rem != null && rem <= 0) {
          alertTimeUp(b, s.settings)
          dispatch({ type: 'MARK_ALERTED' })
        }
      }
      dispatch({ type: 'TICK', now: t })
    }
    tick()
    const id = window.setInterval(tick, active ? 250 : 15_000)
    const onVis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [active])

  // undo expires
  useEffect(() => {
    if (!undo) return
    const id = window.setTimeout(() => setUndo(null), 6000)
    return () => window.clearTimeout(id)
  }, [undo])

  // audio needs a user gesture before it can play
  useEffect(() => {
    const on = () => unlockAudio()
    window.addEventListener('pointerdown', on, { once: false })
    window.addEventListener('keydown', on, { once: false })
    return () => {
      window.removeEventListener('pointerdown', on)
      window.removeEventListener('keydown', on)
    }
  }, [])

  // keep the screen awake while a block is running
  const wantWake = state.settings.wakeLock && active && state.run.timer.status === 'running'
  useEffect(() => {
    if (!wantWake || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const req = async () => {
      try {
        if (document.visibilityState !== 'visible') return
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) lock.release().catch(() => {})
      } catch {
        /* not allowed — fine */
      }
    }
    req()
    const onVis = () => document.visibilityState === 'visible' && req()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [wantWake])

  useEffect(() => setFxEnabled(state.settings.motion), [state.settings.motion])

  useEffect(() => {
    document.documentElement.lang = state.settings.lang
    document.documentElement.dir = state.settings.lang === 'ar' ? 'rtl' : 'ltr'
  }, [state.settings.lang])

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', state.settings.theme === 'dark' ? '#0b0b0c' : '#f5f4f0')
  }, [state.settings.theme])

  const value = useMemo(() => ({ state, now, act, step, undo, doUndo, dismissUndo }), [state, now, act, step, undo, doUndo, dismissUndo])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

function alertTimeUp(b: Block, settings: Settings) {
  if (settings.sound) chime(b.type === 'break' ? 'up' : 'down')
  if (settings.notify && document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(b.type === 'break' ? t('nBreakOver') : t('nTimesUp', { name: b.name || t('task') }), {
        body: b.type === 'break' ? t('nBackToWork') : t('nChoose'),
        tag: 'planet-timer',
      })
    } catch {
      /* some mobile browsers only allow notifications from a service worker */
    }
  }
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('StoreProvider missing')
  return c
}
