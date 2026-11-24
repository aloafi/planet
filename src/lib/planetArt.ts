/** Small colour helpers shared by the transitions. */

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
