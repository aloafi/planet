let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  } catch {
    /* no audio */
  }
}

/** A soft two-note chime. 'down' for time up, 'up' for break over. */
export function chime(dir: 'up' | 'down' = 'down') {
  unlockAudio()
  if (!ctx) return
  const notes = dir === 'down' ? [880, 660] : [660, 990]
  const t0 = ctx.currentTime + 0.02
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator()
    const g = ctx!.createGain()
    o.type = 'sine'
    o.frequency.value = f
    const t = t0 + i * 0.22
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    o.connect(g).connect(ctx!.destination)
    o.start(t)
    o.stop(t + 1)
  })
}
