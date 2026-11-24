// Planet AI — a tiny Vercel function between the app and the Anthropic API.
// Two jobs only: forecast a plan, and recap a finished day. Answers are short JSON.
// Needs ANTHROPIC_API_KEY in the Vercel project's environment variables.

const MODEL = process.env.PLANET_AI_MODEL || 'claude-haiku-5-5'
const MAX_BODY = 24_000

// best-effort throttle per IP (per warm instance) so the key can't be drained
const hits = new Map()
function limited(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  list.push(now)
  hits.set(ip, list)
  return list.length > 12
}

const STYLE = `You are the quiet analyst inside Planet, a minimalist app that runs a person's day one task at a time.
Write like a calm, sharp coach: concrete, specific to the actual task names, honest, warm but never hype.
No emojis, no exclamation marks, no markdown. Keep every string short.`

const PROMPTS = {
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

const LANG = {
  auto: 'Write in the same language as most of the task names (Arabic if they are mostly Arabic, otherwise English).',
  en: 'Write in English.',
  ar: 'Write in clear Modern Standard Arabic.',
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })

  // only answer the app's own pages
  const origin = req.headers.origin || ''
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  if (origin && host && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'origin' })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.status(503).json({ error: 'no_key' })

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon'
  if (limited(ip)) return res.status(429).json({ error: 'rate' })

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return res.status(400).json({ error: 'json' })
    }
  }
  const mode = body && body.mode
  if (!PROMPTS[mode]) return res.status(400).json({ error: 'mode' })
  const payload = JSON.stringify(body.payload ?? {})
  if (payload.length > MAX_BODY) return res.status(413).json({ error: 'size' })
  const lang = LANG[body.lang] || LANG.auto

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.4,
        system: `${PROMPTS[mode]}\n${lang}`,
        messages: [{ role: 'user', content: `Data:\n${payload}\n\nReply with the JSON object only.` }],
      }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('anthropic', r.status, detail.slice(0, 300))
      return res.status(502).json({ error: r.status === 401 ? 'bad_key' : 'upstream' })
    }
    const data = await r.json()
    const text = (data.content || []).map((c) => c.text || '').join('')
    const json = parse(text)
    if (!json) return res.status(502).json({ error: 'format' })
    return res.status(200).json(clean(mode, json))
  } catch (e) {
    console.error('ai error', e)
    return res.status(502).json({ error: 'upstream' })
  }
}

function parse(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v, n, max) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [])

function clean(mode, j) {
  if (mode === 'forecast') return { headline: str(j.headline, 120), outcomes: list(j.outcomes, 4, 160), tip: str(j.tip, 220) }
  return { title: str(j.title, 90), story: str(j.story, 500), wins: list(j.wins, 3, 120), next: str(j.next, 220) }
}
