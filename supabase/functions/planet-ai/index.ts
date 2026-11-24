// Planet AI — Supabase Edge Function (Deno).
// Two jobs only: forecast a plan, and recap a finished day. Short JSON answers.
// Uses the same Anthropic key as the other apps in this project: the ANTHROPIC_API_KEY
// secret, or the key kept in Vault behind the wordly_ai_key RPC. The key never reaches the browser.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MODEL = Deno.env.get('PLANET_AI_MODEL') ?? 'claude-haiku-5-5'
const IP_CAP = 80 // requests per IP per day
const MAX_BODY = 24_000

let cachedKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
async function apiKey(): Promise<string> {
  for (let i = 0; i < 2 && !cachedKey && SERVICE_KEY; i++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wordly_ai_key`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (r.ok) cachedKey = String((await r.json()) ?? '')
    else console.error('key lookup failed', r.status)
  }
  return cachedKey
}

const allowed = (o: string) =>
  o === 'https://planet-plum.vercel.app' ||
  (o.startsWith('https://planet-') && o.endsWith('.vercel.app')) ||
  o.startsWith('http://localhost:') ||
  o.startsWith('http://127.0.0.1:')

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowed(origin) ? origin : 'https://planet-plum.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    Vary: 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
}

async function withinCap(key: string, cap: number): Promise<boolean> {
  if (!SERVICE_KEY) return true
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

const STYLE = `You are the quiet analyst inside Planet, a minimalist app that runs a person's day one task at a time.
Write like a calm, sharp coach: concrete, specific to the actual task names, honest, warm but never hype.
No emojis, no exclamation marks, no markdown. Keep every string short.`

const PROMPTS: Record<string, string> = {
  forecast: `${STYLE}
You get today's plan (ordered tasks and breaks with minutes), optionally an upcoming event such as an exam with the days left, and a few recent days of history.
Predict what the person will have accomplished by the end of today IF they follow the plan exactly.
Return JSON only, exactly this shape:
{"headline": string (max 12 words), "outcomes": string[] (2 to 4 items, max 14 words each, each starts with a past-tense verb, e.g. "Covered…", "Finished…"), "tip": string (max 22 words: one practical risk or adjustment; mention the event and days left when there is one)}`,
  recap: `${STYLE}
You get what actually happened today: each task's status (completed, skipped or left unfinished) with planned vs actual minutes, breaks, total focus time and time saved or lost against the plan, and optionally the event it works toward.
Write a short recap of the day based on the task names.
Return JSON only, exactly this shape:
{"title": string (max 8 words), "story": string (2 or 3 sentences, max 60 words in total, what got done and how the day went), "wins": string[] (1 to 3 items, max 10 words each), "next": string (one suggestion for tomorrow, max 20 words)}`,
}

const LANG: Record<string, string> = {
  auto: 'Write in the same language as most of the task names (Arabic if they are mostly Arabic, otherwise English).',
  en: 'Write in English.',
  ar: 'Write in clear Modern Standard Arabic.',
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [])

function parse(text: string): Record<string, unknown> | null {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    return JSON.parse(text.slice(a, b + 1))
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'))
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, { error: 'method' })
  const origin = req.headers.get('origin')
  if (origin && !allowed(origin)) return reply(403, { error: 'origin' })

  const key = await apiKey()
  if (!key) return reply(503, { error: 'no_key' })

  const raw = await req.text()
  if (raw.length > MAX_BODY) return reply(413, { error: 'size' })
  let body: { mode?: string; payload?: unknown; lang?: string }
  try {
    body = JSON.parse(raw)
  } catch {
    return reply(400, { error: 'json' })
  }
  const mode = body.mode ?? ''
  if (!PROMPTS[mode]) return reply(400, { error: 'mode' })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (!(await withinCap(`planet:ip:${ip}`, IP_CAP))) return reply(429, { error: 'rate' })

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: `${PROMPTS[mode]}\n${LANG[body.lang ?? 'auto'] ?? LANG.auto}`,
        messages: [{ role: 'user', content: `Data:\n${JSON.stringify(body.payload ?? {})}\n\nReply with the JSON object only.` }],
      }),
    })
    if (!r.ok) {
      console.error('anthropic', r.status, (await r.text()).slice(0, 300))
      return reply(502, { error: r.status === 401 ? 'bad_key' : 'upstream' })
    }
    const data = await r.json()
    const text = (data.content ?? []).filter((c: { type?: string }) => c.type === 'text').map((c: { text?: string }) => c.text ?? '').join('')
    const j = parse(text)
    if (!j) {
      console.error('format', data.stop_reason, JSON.stringify(data.content ?? []).slice(0, 600))
      return reply(502, { error: 'format' })
    }
    if (mode === 'forecast') return reply(200, { headline: str(j.headline, 120), outcomes: list(j.outcomes, 4, 160), tip: str(j.tip, 220) })
    return reply(200, { title: str(j.title, 90), story: str(j.story, 500), wins: list(j.wins, 3, 120), next: str(j.next, 220) })
  } catch (e) {
    console.error('ai error', e)
    return reply(502, { error: 'upstream' })
  }
})
