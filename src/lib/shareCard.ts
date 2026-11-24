import type { DayLog } from './types'
import { human, signed } from './format'
import { isAr, nMin, t } from './i18n'
import { LOGO_SRC, loadBrand, tintedBrand } from './brand'

/**
 * The shareable day — strictly black and white, nothing decorative.
 * 1080×1350 (4:5). Arabic lines are laid out right-to-left.
 */

const W = 1080
const H = 1350
const PAD = 96
const SANS = `'Geist Variable', 'IBM Plex Sans Arabic', system-ui, sans-serif`
const BLACK = '#000000'
const WHITE = '#ffffff'
const white = (a: number) => `rgba(255,255,255,${a})`

const isRtl = (s: string) => isAr() || /[֐-ࣿ]/.test(s)

export interface CardInput {
  log: DayLog
  eventLine: string | null
  dateLine: string
}

export async function renderDayCard({ log, eventLine, dateLine }: CardInput): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load(`600 80px 'Geist Variable'`),
      document.fonts.load(`400 30px 'Geist Variable'`),
      document.fonts.load(`600 80px 'IBM Plex Sans Arabic'`, 'ع'),
      document.fonts.load(`400 30px 'IBM Plex Sans Arabic'`, 'ع'),
    ])
  } catch {
    /* system fonts */
  }

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = BLACK
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // header: wordmark · date
  const rtl = isAr()
  await loadBrand(LOGO_SRC)
  const logo = tintedBrand(LOGO_SRC, WHITE)
  if (logo) {
    const lh = 46
    const lw = (lh * logo.width) / logo.height
    ctx.drawImage(logo, rtl ? W - PAD - lw : PAD, 132 - lh + 8, lw, lh)
  } else {
    font(ctx, 600, 30)
    ctx.fillStyle = WHITE
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillText('Planet.', rtl ? W - PAD : PAD, 132)
  }
  font(ctx, 400, 26)
  ctx.fillStyle = white(0.55)
  ctx.textAlign = rtl ? 'left' : 'right'
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.fillText(rtl ? dateLine : dateLine.toUpperCase(), rtl ? PAD : W - PAD, 132)
  ctx.direction = 'ltr'
  ctx.textAlign = 'left'
  rule(ctx, 164, 0.25)

  // title
  const recap = log.recap
  const pct = log.total ? Math.round((log.completed / log.total) * 100) : 0
  const title = recap?.title || (pct === 100 ? t('allDone') : log.endedEarly ? t('sessionEnded') : t('dayComplete'))
  let y = text(ctx, title, 290, { size: 80, weight: 650, color: WHITE, lineH: 88, maxLines: 3 })
  if (eventLine) y = text(ctx, eventLine, y + 62, { size: 30, weight: 400, color: white(0.55), lineH: 40, maxLines: 1 })

  // stats
  y += 110
  const stats: [string, string][] = [
    [`${log.completed}/${log.total}`, t('cardTasksDone')],
    [human(log.focusedMs), t('cardFocused')],
    Math.abs(log.bankMs) >= 60_000 ? [signed(log.bankMs), log.bankMs > 0 ? t('cardSaved') : t('cardOver')] : [`${pct}%`, t('cardCompletion')],
  ]
  const colW = (W - PAD * 2) / 3
  stats.forEach(([v, l], i) => {
    const x = rtl ? W - PAD - i * colW : PAD + i * colW
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.direction = rtl ? 'rtl' : 'ltr'
    font(ctx, 500, 58)
    ctx.fillStyle = WHITE
    ctx.fillText(v, x, y, colW - 24)
    font(ctx, 400, 24)
    ctx.fillStyle = white(0.5)
    ctx.fillText(rtl ? l : l.toUpperCase(), x, y + 44)
    ctx.textAlign = 'left'
    ctx.direction = 'ltr'
  })
  y += 92
  rule(ctx, y, 0.25)
  y += 72

  // tasks
  const tasks = log.blocks.filter((b) => b.type === 'task')
  const story = recap?.story ?? ''
  const boxH = story ? storyHeight(ctx, story) : 0
  const bottom = H - 150 - (boxH ? boxH + 48 : 0)
  const room = Math.max(0, Math.floor((bottom - y) / 58) + 1)
  const shown = tasks.length > room ? tasks.slice(0, Math.max(0, room - 1)) : tasks
  for (const task of shown) {
    const done = task.status === 'completed'
    const skipped = task.status === 'skipped'
    const rtl = isRtl(task.name)
    const mark = done ? '✓' : skipped ? '–' : '○'
    const mins = nMin(Math.round(task.spentMs / 60_000) || task.plannedMin)
    const color = done ? WHITE : white(skipped ? 0.35 : 0.55)

    font(ctx, 400, 26)
    const mw = ctx.measureText(mins).width
    ctx.fillStyle = white(0.45)
    ctx.textAlign = rtl ? 'left' : 'right'
    ctx.fillText(mins, rtl ? PAD : W - PAD, y)

    font(ctx, 500, 34)
    ctx.fillStyle = color
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillText(mark, rtl ? W - PAD : PAD, y)

    font(ctx, done ? 500 : 400, 34)
    ctx.direction = rtl ? 'rtl' : 'ltr'
    const nx = rtl ? W - PAD - 48 : PAD + 48
    const name = fit(ctx, task.name, W - PAD * 2 - 48 - mw - 40)
    ctx.fillText(name, nx, y)
    if (skipped) {
      const w = ctx.measureText(name).width
      ctx.strokeStyle = white(0.35)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(rtl ? nx - w : nx, y - 11)
      ctx.lineTo(rtl ? nx : nx + w, y - 11)
      ctx.stroke()
    }
    ctx.direction = 'ltr'
    ctx.textAlign = 'left'
    y += 58
  }
  if (tasks.length > shown.length) {
    font(ctx, 400, 28)
    ctx.fillStyle = white(0.5)
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.direction = rtl ? 'rtl' : 'ltr'
    ctx.fillText(t('cardMore', { n: tasks.length - shown.length }), rtl ? W - PAD - 48 : PAD + 48, y)
    ctx.textAlign = 'left'
    ctx.direction = 'ltr'
  }

  // AI story — in a plain sharp-cornered box
  if (story) {
    const top = H - 150 - boxH
    ctx.strokeStyle = WHITE
    ctx.lineWidth = 2
    ctx.strokeRect(PAD, top, W - PAD * 2, boxH)
    text(ctx, story, top + 64, { size: 28, weight: 400, color: WHITE, lineH: 42, maxLines: 4, inset: 36 })
  }

  // footer
  font(ctx, 400, 24)
  ctx.fillStyle = white(0.45)
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.fillText(t('cardFooter'), rtl ? W - PAD : PAD, H - 72)
  ctx.textAlign = 'left'
  ctx.direction = 'ltr'

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))
}

function font(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${SANS}`
}

function rule(ctx: CanvasRenderingContext2D, y: number, a: number) {
  ctx.strokeStyle = white(a)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
}

function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s
  let t = s
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  const lines: string[] = []
  let cur = ''
  for (const w of s.split(/\s+/)) {
    const next = cur ? cur + ' ' + w : w
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

function storyHeight(ctx: CanvasRenderingContext2D, s: string) {
  font(ctx, 400, 28)
  const n = Math.min(4, wrap(ctx, s, W - PAD * 2 - 72).length)
  return 64 + (n - 1) * 42 + 44
}

/** wrapped text; returns the baseline y of the last line */
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  y: number,
  o: { size: number; weight: number; color: string; lineH: number; maxLines: number; inset?: number },
) {
  const inset = o.inset ?? 0
  font(ctx, o.weight, o.size)
  ctx.fillStyle = o.color
  const rtl = isRtl(s)
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  const maxW = W - PAD * 2 - inset * 2
  const lines = wrap(ctx, s, maxW)
  const out = lines.slice(0, o.maxLines)
  if (lines.length > o.maxLines) out[out.length - 1] = fit(ctx, out[out.length - 1] + ' …', maxW)
  const x = rtl ? W - PAD - inset : PAD + inset
  out.forEach((l, i) => ctx.fillText(l, x, y + i * o.lineH))
  ctx.textAlign = 'left'
  ctx.direction = 'ltr'
  return y + (out.length - 1) * o.lineH
}
