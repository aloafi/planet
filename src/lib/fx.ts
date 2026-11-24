/**
 * Planet transitions — drawn on a throwaway full-screen canvas that never blocks input.
 *
 *  launch: the button collapses into a small planet that rises to the centre of the
 *          screen with a ring and two moons, gravity waves ripple outward and the
 *          stars streak past; then the camera dives into the planet to reveal the next screen.
 *  orbit:  a lighter version for Finish / End break — waves, a pop of particles and a
 *          ringed planet blooming out of the button.
 */

import { clamp, rgba } from './planetArt'
import { brandInk, MARK_SRC, tintedBrand } from './brand'

export type FxKind = 'launch' | 'orbit'
export type FxTint = 'task' | 'break'

let enabled = true
export const setFxEnabled = (v: boolean) => {
  enabled = v
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Origin = the element's centre (falls back to the main button, then the screen centre). */
export function originOf(el?: Element | null) {
  const target = el ?? document.querySelector('.primary')
  if (target) {
    const r = target.getBoundingClientRect()
    if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.75 }
}

let active: { stop: () => void } | null = null

export function planetFx(kind: FxKind, from?: Element | null, tint: FxTint = 'task') {
  if (!enabled || reduced() || typeof document === 'undefined') return
  active?.stop()

  const o = originOf(from)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = window.innerWidth
  const H = window.innerHeight
  const canvas = document.createElement('canvas')
  canvas.className = 'fx-canvas'
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const maybe = canvas.getContext('2d')
  if (!maybe) {
    canvas.remove()
    return
  }
  const ctx: CanvasRenderingContext2D = maybe
  ctx.scale(dpr, dpr)

  const root = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => root.getPropertyValue(n).trim() || f
  // strictly monochrome: the theme's text colour on the theme's background
  const ink = v('--text', '#f2f1ec')
  const backdrop = v('--bg', '#0b0b0c')
  const logo = tintedBrand(MARK_SRC, brandInk())
  void tint

  const diag = Math.hypot(W, H)
  const C = { x: W / 2, y: H * 0.46 }
  const R = Math.min(W, H) * (W < 640 ? 0.2 : 0.15)
  const T = kind === 'launch' ? 1650 : 1050
  const t0 = performance.now()

  // starfield (launch) / particle burst (orbit)
  const rand = mulberry(Math.floor(t0))
  const stars = Array.from({ length: kind === 'launch' ? 170 : 46 }, () => {
    const a = rand() * Math.PI * 2
    return {
      a,
      d: kind === 'launch' ? 20 + rand() * diag * 0.55 : 0,
      sp: kind === 'launch' ? 0.35 + rand() * 1.1 : 0.12 + rand() * 0.38,
      size: 0.6 + rand() * 1.6,
      tw: rand() * Math.PI * 2,
      curl: (rand() - 0.5) * 0.9,
    }
  })

  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    window.clearTimeout(guard)
    canvas.remove()
    if (active?.stop === stop) active = null
  }
  active = { stop }

  // safety net in case animation frames are throttled (background tab)
  const guard = window.setTimeout(() => stop(), T + 400)
  const frame = () => {
    const t = performance.now() - t0
    if (t >= T) return stop()
    ctx.clearRect(0, 0, W, H)
    try {
      if (kind === 'launch') drawLaunch(t)
      else drawOrbit(t)
    } catch {
      return stop()
    }
    raf = requestAnimationFrame(frame)
  }

  /* ---------------- launch ---------------- */
  function drawLaunch(t: number) {
    // veil over the page while it swaps underneath
    const veil = t < 260 ? ease.out(t / 260) : t < 900 ? 1 : 1 - ease.inOut((t - 900) / 750)
    ctx.globalAlpha = 0.93 * veil
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1

    // planet position: rises from the button to the centre, then the camera dives in
    const rise = ease.inOut(clamp((t - 60) / 640))
    const px = lerp(o.x, C.x, rise)
    const py = lerp(o.y, C.y, rise) - Math.sin(rise * Math.PI) * 40
    const grow = ease.outBack(clamp((t - 40) / 620))
    const dive = ease.in(clamp((t - 1080) / 520))
    const r = Math.max(0.01, R * grow * (1 + dive * 1.4))
    const fade = 1 - clamp((t - 1220) / 380)

    // warp stars streaming out from the planet
    const warp = clamp(t / 1100)
    for (const s of stars) {
      const speed = (0.25 + ease.in(warp) * 2.2) * s.sp
      const d = s.d + t * speed
      const len = 2 + ease.inOut(warp) * 60 * s.sp * (1 - dive)
      const x = px + Math.cos(s.a) * d
      const y = py + Math.sin(s.a) * d
      const a = clamp(Math.min(t / 300, 1) * (1 - clamp((t - 1100) / 450)) * (0.35 + 0.65 * Math.abs(Math.sin(s.tw + t / 240))))
      if (a <= 0) continue
      ctx.strokeStyle = rgba(ink, a * 0.9)
      ctx.lineWidth = s.size
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - Math.cos(s.a) * len, y - Math.sin(s.a) * len)
      ctx.stroke()
    }

    // gravity waves: from the button first, then from the planet as it settles
    for (let i = 0; i < 4; i++) waves(o.x, o.y, t - i * 110, 900, diag * 0.75, 0.55)
    for (let i = 0; i < 3; i++) waves(px, py, t - 620 - i * 150, 1000, diag * 0.9, 0.38, r)

    // the planet itself
    if (fade > 0) {
      ctx.globalAlpha = fade
      drawPlanet(px, py, r, t, ease.out(clamp((t - 100) / 700)))
      ctx.globalAlpha = 1
    }
  }

  /* ---------------- orbit (finish) ---------------- */
  function drawOrbit(t: number) {
    for (let i = 0; i < 3; i++) waves(o.x, o.y, t - i * 120, 800, Math.max(W, H) * 0.7, 0.5)

    // particles flung out along curved paths
    for (const s of stars) {
      const p = clamp(t / 900)
      const d = ease.out(p) * s.sp * Math.max(W, H) * 0.9
      const ang = s.a + s.curl * ease.out(p)
      const x = o.x + Math.cos(ang) * d
      const y = o.y + Math.sin(ang) * d * 0.8
      const a = (1 - p) * 0.9
      if (a <= 0) continue
      ctx.fillStyle = rgba(ink, a)
      ctx.beginPath()
      ctx.arc(x, y, s.size * (1.3 - p * 0.6), 0, Math.PI * 2)
      ctx.fill()
    }

    // a small ringed planet blooms out of the button, then dissolves upward
    const g = ease.outBack(clamp(t / 420))
    const out = clamp((t - 520) / 500)
    const r = Math.max(0.01, (W < 640 ? 30 : 40) * g * (1 + out * 0.5))
    ctx.globalAlpha = 1 - ease.in(out)
    drawPlanet(o.x, o.y - ease.out(out) * 60 - g * 6, r, t, g)
    ctx.globalAlpha = 1
  }

  /* ---------------- pieces ---------------- */
  function waves(x: number, y: number, t: number, dur: number, maxR: number, alpha: number, minR = 0) {
    if (t <= 0 || t >= dur) return
    const p = t / dur
    const rr = minR + ease.out(p) * maxR
    const a = alpha * (1 - p) * (1 - p)
    // soft band
    const band = ctx.createRadialGradient(x, y, Math.max(0, rr - 26), x, y, rr + 2)
    band.addColorStop(0, rgba(ink, 0))
    band.addColorStop(0.85, rgba(ink, a * 0.18))
    band.addColorStop(1, rgba(ink, 0))
    ctx.fillStyle = band
    ctx.beginPath()
    ctx.arc(x, y, rr + 2, 0, Math.PI * 2)
    ctx.fill()
    // crisp ring
    ctx.strokeStyle = rgba(ink, a)
    ctx.lineWidth = 1.4 * (1 - p) + 0.4
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, Math.PI * 2)
    ctx.stroke()
  }

  /** the Planet logo as the planet: soft glow, a slight tilt that settles, gentle float */
  function drawPlanet(x: number, y: number, r: number, t: number, settle: number) {
    if (r < 1.5) return
    const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.1)
    glow.addColorStop(0, rgba(ink, 0.16))
    glow.addColorStop(1, rgba(ink, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, r * 2.1, 0, Math.PI * 2)
    ctx.fill()
    if (!logo) return
    const w = r * 2.6
    const h = (w * logo.height) / logo.width
    ctx.save()
    ctx.translate(x, y + Math.sin(t / 380) * r * 0.03)
    ctx.rotate(-0.28 * (1 - settle))
    ctx.drawImage(logo, -w / 2, -h / 2, w, h)
    ctx.restore()
  }

  raf = requestAnimationFrame(frame)
}

/* ---------------- helpers ---------------- */
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const ease = {
  out: (p: number) => 1 - Math.pow(1 - p, 3),
  in: (p: number) => p * p * p,
  inOut: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outBack: (p: number) => {
    const c = 1.5
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2)
  },
}
function mulberry(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
