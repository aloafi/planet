/** 1:05:09 / 45:00 — for countdowns */
export function clock(ms: number) {
  const neg = ms < 0
  // round up while counting down so 00:00 means "really zero"
  const total = neg ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return (neg ? '+' : '') + (h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`)
}

/** elapsed counter for untimed tasks */
export function stopwatch(ms: number) {
  return clock(Math.floor(ms / 1000) * 1000).replace('+', '')
}

/** 2h 15m / 45 min */
export function human(ms: number) {
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** +5 min / −1h 10m / +40 sec — signed, for the time bank */
export function signed(ms: number) {
  const sign = ms < 0 ? '−' : '+'
  const abs = Math.abs(ms)
  if (abs < 60_000) return `${sign}${Math.round(abs / 1000)} sec`
  return sign + human(abs)
}

export function minutesLabel(min: number) {
  return human(min * 60_000)
}

/** minute-of-day → 08:45 */
export function hm(minuteOfDay: number) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
