// Planet sign-up without email verification.
// Creates the account already confirmed (no email is sent), then the app signs in with the password.
// An earlier sign-up that is still waiting for its confirmation email is activated with the new password.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const IP_CAP = 15 // sign-ups per IP per day

const allowed = (o: string) =>
  o === 'https://www.tryplanet.site' ||
  o === 'https://tryplanet.site' ||
  o === 'https://planet-plum.vercel.app' ||
  (o.startsWith('https://planet-') && o.endsWith('.vercel.app')) ||
  o.startsWith('http://localhost:') ||
  o.startsWith('http://127.0.0.1:')

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowed(origin) ? origin : 'https://www.tryplanet.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  Vary: 'Origin',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
})

async function withinCap(key: string, cap: number) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wordly_ai_hit`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_cap: cap }),
    })
    return r.ok ? (await r.json()) === true : true
  } catch {
    return true
  }
}

async function findByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const u = data.users.find((x) => (x.email ?? '').toLowerCase() === email)
    if (u) return u
    if (data.users.length < 200) return null
  }
  return null
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'))
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, { error: 'method' })
  const origin = req.headers.get('origin')
  if (origin && !allowed(origin)) return reply(403, { error: 'origin' })

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'json' })
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, { error: 'email' })
  if (password.length < 6 || password.length > 72) return reply(400, { error: 'password' })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (!(await withinCap(`planet:signup:${ip}`, IP_CAP))) return reply(429, { error: 'rate' })

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return reply(200, { ok: true })

  // already registered?
  const existing = await findByEmail(email)
  if (!existing) {
    console.error('createUser', error.message)
    return reply(400, { error: 'create', message: error.message })
  }
  if (existing.email_confirmed_at) return reply(409, { error: 'exists' })
  // a sign-up still waiting for its confirmation email: activate it with this password
  const { error: upd } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
  if (upd) {
    console.error('activate', upd.message)
    return reply(400, { error: 'create', message: upd.message })
  }
  return reply(200, { ok: true, activated: true })
})
