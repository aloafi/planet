import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, SUPABASE_URL_PUBLIC, SUPABASE_KEY_PUBLIC } from './supabase'
import { useStore } from './store'
import { initialState, revive } from './engine'
import type { AppState } from './types'

/**
 * Your data lives in your Supabase account (table planet_state, one row per user)
 * and a copy stays on the device so the app keeps working offline.
 * Whichever copy was changed last wins; the device pushes changes ~1s after you make them.
 */

export type SyncStatus = 'local' | 'syncing' | 'saved' | 'offline' | 'error'

interface Cloud {
  session: Session | null
  email: string | null
  status: SyncStatus
  savedAt: number | null
  recovery: boolean
  clearRecovery: () => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<{ error: string | null; confirm: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
  setPassword: (password: string) => Promise<string | null>
  syncNow: () => void
}

const Ctx = createContext<Cloud | null>(null)
const OWNER = 'planet:owner'
const TABLE = 'planet_state'

export function CloudProvider({ children }: { children: ReactNode }) {
  const { state, act } = useStore()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>('local')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [recovery, setRecovery] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const lastSynced = useRef(0)
  const busy = useRef(false)
  const uid = session?.user.id ?? null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const replace = useCallback((s: AppState) => act({ type: 'HYDRATE', state: s }), [act])

  const push = useCallback(async () => {
    if (!uid || busy.current) return
    const s = stateRef.current
    busy.current = true
    setStatus('syncing')
    const { error } = await supabase.from(TABLE).upsert({ user_id: uid, state: s, client_updated_at: s.updatedAt })
    busy.current = false
    if (error) {
      setStatus(navigator.onLine ? 'error' : 'offline')
      return
    }
    lastSynced.current = s.updatedAt
    setSavedAt(Date.now())
    setStatus('saved')
    // something changed while we were saving — send that too
    if (stateRef.current.updatedAt > s.updatedAt) window.setTimeout(() => push(), 300)
  }, [uid])

  const pull = useCallback(async () => {
    if (!uid || busy.current) return
    busy.current = true
    setStatus((st) => (st === 'saved' ? st : 'syncing'))
    const { data, error } = await supabase.from(TABLE).select('state, client_updated_at').eq('user_id', uid).maybeSingle()
    busy.current = false
    if (error) {
      setStatus(navigator.onLine ? 'error' : 'offline')
      return
    }
    let owner: string | null = null
    try {
      owner = localStorage.getItem(OWNER)
      localStorage.setItem(OWNER, uid)
    } catch {
      /* ignore */
    }
    const local = stateRef.current
    const foreign = owner !== null && owner !== uid // this device last held another account's data
    if (!data) {
      if (foreign) {
        // a new account on a device used by someone else starts clean (keeping the device's look & language)
        const fresh = { ...initialState(Date.now()), settings: local.settings, updatedAt: Date.now() }
        replace(fresh)
        stateRef.current = fresh
      }
      await push()
      return
    }
    const remoteAt = Number(data.client_updated_at) || 0
    if (foreign || remoteAt > (local.updatedAt || 0)) {
      const next = revive(data.state, Date.now())
      next.updatedAt = remoteAt
      lastSynced.current = remoteAt
      replace(next)
      setSavedAt(Date.now())
      setStatus('saved')
    } else if ((local.updatedAt || 0) > remoteAt) {
      await push()
    } else {
      lastSynced.current = remoteAt
      setSavedAt(Date.now())
      setStatus('saved')
    }
  }, [uid, push, replace])

  // on sign-in: reconcile; then keep checking when you come back to the app
  useEffect(() => {
    if (!uid) {
      setStatus('local')
      return
    }
    pull()
    const onVis = () => document.visibilityState === 'visible' && pull()
    const onOnline = () => pull()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    const id = window.setInterval(() => document.visibilityState === 'visible' && pull(), 45_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      window.clearInterval(id)
    }
  }, [uid, pull])

  // push every change shortly after it happens
  useEffect(() => {
    if (!uid || state.updatedAt <= lastSynced.current) return
    const id = window.setTimeout(() => push(), 1000)
    return () => window.clearTimeout(id)
  }, [uid, state.updatedAt, push])

  // make sure the last edit is sent if the tab is closed right after it
  useEffect(() => {
    const onHide = () => {
      if (uid && stateRef.current.updatedAt > lastSynced.current) push()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [uid, push])

  const value = useMemo<Cloud>(
    () => ({
      session,
      email: session?.user.email ?? null,
      status,
      savedAt,
      recovery,
      clearRecovery: () => setRecovery(false),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return error ? error.message : null
      },
      signUp: async (email, password) => {
        // Accounts are created already confirmed by the planet-signup function — no verification email.
        const mail = email.trim()
        let code: string | null = null
        try {
          const r = await fetch(`${SUPABASE_URL_PUBLIC}/functions/v1/planet-signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY_PUBLIC },
            body: JSON.stringify({ email: mail, password }),
          })
          const j = await r.json().catch(() => ({}))
          if (!r.ok) code = j.error ?? 'create'
        } catch {
          code = 'network'
        }
        if (code && code !== 'exists') return { error: code, confirm: false }
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
        if (error) return { error: code === 'exists' ? 'exists' : error.message, confirm: false }
        return { error: null, confirm: false }
      },
      signOut: async () => {
        if (uid && stateRef.current.updatedAt > lastSynced.current) await push()
        await supabase.auth.signOut()
        setSavedAt(null)
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        return error ? error.message : null
      },
      setPassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (!error) setRecovery(false)
        return error ? error.message : null
      },
      syncNow: () => {
        pull()
      },
    }),
    [session, status, savedAt, recovery, uid, push, pull],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCloud() {
  const c = useContext(Ctx)
  if (!c) throw new Error('CloudProvider missing')
  return c
}
