import type { DayLog } from './types'
import { mix, paintPlanet, rgba } from './planetArt'
import { human, signed } from './format'

const W = 1080
const H = 1350
const PAD = 88
const SANS = `'Geist Variable', 'IBM Plex Sans Arabic', system-ui, sans-serif`

const isRtl = (t: string) => /[֐-ࣿ]/.test(t)

export interface CardInput {
  log: DayLog
  /** e.g. "Physics exam · in 12 days" */
  eventLine: string | null
  dateLine: string
}

/** Draws the day as a 4:5 image, ready for stories and chats. */
export async function renderDayCard({ log, eventLine, dateLine }: CardInput): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load(`600 80px 'Geist Variable'`),
      document.fonts.load(`400 30px 'Geist Variable'`),
      document.fonts.load(`600 80px 'IBM Plex Sans Arabic'`, 'ع'),
      document.fonts.load(`400 30px 'IBM Plex Sans Arabic'`, 'ع'),
    ])
  } catch {
    /* fall back to system fonts */
  }

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const ink = '#f2f1ec'
  const muted = '#8d8c87'
  const faint = '#4b4a47'
  const accent = '#8fd3c3'
  const over = '#e8a46c'

  // background + stars
  ctx.fillStyle = '#0b0b0c'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W - 160, 210, 0, W - 160, 210, 620)
  glow.addColorStop(0, 'rgba(143,211,195,0.10)')
  glow.addColorStop(1, 'rgba(143,211,195,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  let seed = hash(log.id)
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rgba(ink, 0.08 + rnd() * 0.35)
    ctx.beginPath()
    ctx.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // planet, top right
  paintPlanet(ctx, ink, ['#ffffff', mix(ink, '#000000', 0.35), mix(ink, '#000000', 0.9)], W - 190, 215, 92, 1800, 1)

  // wordmark + date
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.arc(PAD + 9, 112, 9, 0, Math.PI * 2)
  ctx.fill()
  setFont(ctx, 600, 34)
  ctx.fillText('planet', PAD + 32, 124)
  setFont(ctx, 500, 26)
  ctx.fillStyle = muted
  ctx.fillText(dateLine.toUpperCase(), PAD, 200, 640)

  // content starts below the planet so right-to-left text never runs into it
  let y = 400
  if (eventLine) {
    y = text(ctx, eventLine, y, { size: 30, weight: 500, color: accent, maxW: W - PAD * 2, lineH: 40, maxLines: 1 }) + 18
  } else y = 330

  // headline
  const recap = log.recap
  const pct = log.total ? Math.round((log.completed / log.total) * 100) : 0
  const title = recap?.title || (pct === 100 ? 'Everything done.' : log.endedEarly ? 'Session ended.' : 'Day complete.')
  y = text(ctx, title, y + 70, { size: 84, weight: 650, color: ink, maxW: W - PAD * 2, lineH: 92, maxLines: 3, tight: true }) + 36

  // stats
  const stats: [string, string, string?][] = [
    [`${log.completed}/${log.total}`, 'tasks done'],
    [human(log.focusedMs), 'focused'],
  ]
  if (Math.abs(log.bankMs) >= 60_000) stats.push([signed(log.bankMs), log.bankMs > 0 ? 'saved' : 'over plan', log.bankMs > 0 ? accent : over])
  else stats.push([`${pct}%`, 'completion'])
  const colW = (W - PAD * 2) / 3
  ctx.strokeStyle = rgba(ink, 0.12)
  ctx.lineWidth = 2
  line(ctx, PAD, y, W - PAD, y)
  stats.forEach(([v, l, col], i) => {
    const x = PAD + i * colW + (i ? 28 : 0)
    if (i) line(ctx, PAD + i * colW, y + 28, PAD + i * colW, y + 150)
    setFont(ctx, 500, 64)
    ctx.fillStyle = col || ink
    ctx.textAlign = 'left'
    ctx.direction = 'ltr'
    ctx.fillText(v, x, y + 100, colW - 40)
    setFont(ctx, 400, 26)
    ctx.fillStyle = muted
    ctx.fillText(l, x, y + 142)
  })
  y += 178
  line(ctx, PAD, y, W - PAD, y)
  y += 70

  // the day's tasks
  const tasks = log.blocks.filter((b) => b.type === 'task')
  const footerTop = H - 150
  const storyH = recap?.story ? 150 : 0
  const room = Math.max(0, Math.floor((footerTop - storyH - y) / 56))
  const shown = tasks.slice(0, tasks.length > room ? Math.max(0, room - 1) : room)
  for (const t of shown) {
    const done = t.status === 'completed'
    const skipped = t.status === 'skipped'
    const rtl = isRtl(t.name)
    const markX = rtl ? W - PAD - 14 : PAD + 14
    // mark
    ctx.lineWidth = 3
    if (done) {
      ctx.fillStyle = ink
      ctx.beginPath()
      ctx.arc(markX, y - 11, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#0b0b0c'
      ctx.beginPath()
      ctx.moveTo(markX - 6, y - 11)
      ctx.lineTo(markX - 1.5, y - 6)
      ctx.lineTo(markX + 7, y - 16)
      ctx.stroke()
    } else {
      ctx.strokeStyle = skipped ? faint : muted
      ctx.setLineDash(skipped ? [5, 5] : [])
      ctx.beginPath()
      ctx.arc(markX, y - 11, 12.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    const nameColor = done ? ink : skipped ? faint : muted
    const right = `${Math.round(t.spentMs / 60_000) || t.plannedMin} min`
    setFont(ctx, 400, 26)
    const rw = ctx.measureText(right).width
    const textX = rtl ? W - PAD - 48 : PAD + 48
    const maxW = W - PAD * 2 - 48 - rw - 40
    setFont(ctx, done ? 500 : 400, 36)
    ctx.fillStyle = nameColor
    ctx.direction = rtl ? 'rtl' : 'ltr'
    ctx.textAlign = rtl ? 'right' : 'left'
    const name = fit(ctx, t.name, maxW)
    ctx.fillText(name, textX, y)
    if (skipped) {
      const w = ctx.measureText(name).width
      ctx.strokeStyle = faint
      ctx.lineWidth = 2
      line(ctx, rtl ? textX - w : textX, y - 12, rtl ? textX : textX + w, y - 12)
    }
    setFont(ctx, 400, 26)
    ctx.fillStyle = faint
    ctx.direction = 'ltr'
    ctx.textAlign = rtl ? 'left' : 'right'
    ctx.fillText(right, rtl ? PAD : W - PAD, y)
    ctx.textAlign = 'left'
    y += 56
  }
  if (tasks.length > shown.length) {
    setFont(ctx, 400, 28)
    ctx.fillStyle = muted
    ctx.direction = 'ltr'
    ctx.textAlign = 'left'
    ctx.fillText(`+${tasks.length - shown.length} more`, PAD + 48, y)
    y += 56
  }

  // AI story
  if (recap?.story) {
    text(ctx, recap.story, Math.min(y + 30, footerTop - storyH + 40), { size: 28, weight: 400, color: muted, maxW: W - PAD * 2, lineH: 40, maxLines: 3 })
  }

  // footer
  ctx.strokeStyle = rgba(ink, 0.12)
  ctx.lineWidth = 2
  line(ctx, PAD, H - 120, W - PAD, H - 120)
  setFont(ctx, 400, 26)
  ctx.fillStyle = muted
  ctx.direction = 'ltr'
  ctx.textAlign = 'left'
  ctx.fillText('One task. One screen. One action.', PAD, H - 70)
  ctx.textAlign = 'right'
  ctx.fillStyle = ink
  setFont(ctx, 600, 26)
  ctx.fillText('planet', W - PAD, H - 70)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${SANS}`
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s
  let t = s
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

/** wrapped text; returns the baseline y of the last line. Handles Arabic right-to-left. */
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  y: number,
  o: { size: number; weight: number; color: string; maxW: number; lineH: number; maxLines: number; tight?: boolean },
) {
  setFont(ctx, o.weight, o.size)
  ctx.fillStyle = o.color
  const rtl = isRtl(s)
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  if (o.tight && 'letterSpacing' in ctx && !rtl) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${-o.size * 0.035}px`
  const x = rtl ? W - PAD : PAD
  const words = s.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (ctx.measureText(next).width > o.maxW && cur) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) lines.push(cur)
  const out = lines.slice(0, o.maxLines)
  if (lines.length > o.maxLines) out[out.length - 1] = fit(ctx, out[out.length - 1] + ' …', o.maxW)
  out.forEach((l, i) => ctx.fillText(l, x, y + i * o.lineH))
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px'
  ctx.textAlign = 'left'
  ctx.direction = 'ltr'
  return y + (out.length - 1) * o.lineH
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
