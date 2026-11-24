/** The ringed planet with moons — shared by the transitions and the share card. */

export function paintPlanet(ctx: CanvasRenderingContext2D, ink: string, sphere: string[], x: number, y: number, r: number, t: number, ringAmt: number) {
  if (r < 1.5) return
  const tilt = -0.38
  const spin = t / 900

  // glow
  const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.2)
  glow.addColorStop(0, rgba(ink, 0.22))
  glow.addColorStop(1, rgba(ink, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2)
  ctx.fill()

  // back half of the ring and moons behind the planet
  if (ringAmt > 0.01) {
    ring(ctx, ink, x, y, r, tilt, Math.PI, Math.PI * 2, ringAmt)
    moons(ctx, ink, x, y, r, tilt, spin, false, ringAmt)
  }

  // sphere with light from the upper left
  const body = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r)
  body.addColorStop(0, sphere[0])
  body.addColorStop(0.55, sphere[1])
  body.addColorStop(1, sphere[2])
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  // drifting cloud bands, clipped to the sphere
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  for (let i = -3; i <= 3; i++) {
    const by = (i / 3.6) * r
    const w = Math.sqrt(Math.max(0, r * r - by * by))
    const off = ((spin * 0.35 * r + i * 23) % (w * 2 || 1)) - w
    ctx.fillStyle = rgba(i % 2 ? '#000000' : '#ffffff', 0.07)
    ctx.beginPath()
    ctx.ellipse(off * 0.25, by, w, r * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // rim light
  ctx.strokeStyle = rgba(ink, 0.35)
  ctx.lineWidth = Math.max(1, r * 0.015)
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.5, r - ctx.lineWidth / 2), Math.PI * 0.95, Math.PI * 1.6)
  ctx.stroke()

  // front half of the ring and moons in front
  if (ringAmt > 0.01) {
    ring(ctx, ink, x, y, r, tilt, 0, Math.PI, ringAmt)
    moons(ctx, ink, x, y, r, tilt, spin, true, ringAmt)
  }
}

function ring(ctx: CanvasRenderingContext2D, ink: string, x: number, y: number, r: number, tilt: number, a0: number, a1: number, amt: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  for (const [k, w, a] of [
    [1.55, 0.05, 0.5],
    [1.78, 0.09, 0.32],
    [2.02, 0.03, 0.22],
  ] as const) {
    ctx.strokeStyle = rgba(ink, a * amt)
    ctx.lineWidth = Math.max(0.8, r * w)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * k, r * k * 0.24, 0, a0, a1)
    ctx.stroke()
  }
  ctx.restore()
}

function moons(ctx: CanvasRenderingContext2D, ink: string, x: number, y: number, r: number, tilt: number, spin: number, front: boolean, amt: number) {
  for (const [dist, size, speed, ph] of [
    [2.5, 0.11, 1.3, 0.4],
    [3.2, 0.07, -0.9, 2.6],
  ] as const) {
    const ang = ph + spin * speed * 2
    const inFront = Math.sin(ang) > 0
    if (inFront !== front) continue
    const ex = Math.cos(ang) * r * dist
    const ey = Math.sin(ang) * r * dist * 0.3
    const mx = x + ex * Math.cos(tilt) - ey * Math.sin(tilt)
    const my = y + ex * Math.sin(tilt) + ey * Math.cos(tilt)
    const mr = Math.max(1.2, r * size)
    const g = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, 0, mx, my, mr)
    g.addColorStop(0, rgba('#ffffff', amt))
    g.addColorStop(1, rgba(ink, 0.5 * amt))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(mx, my, mr, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* helpers */
export const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n))

export function hex(c: string): [number, number, number] {
  let h = c.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [242, 241, 236]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function rgba(c: string, a: number) {
  const [r, g, b] = hex(c)
  return `rgba(${r},${g},${b},${clamp(a)})`
}
export function mix(a: string, b: string, p: number) {
  const x = hex(a)
  const y = hex(b)
  const m = x.map((v, i) => Math.round(v + (y[i] - v) * p))
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('')
}
