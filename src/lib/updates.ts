/**
 * Keeps an open tab on the latest deploy: when the site has been updated,
 * the page reloads itself the next time you come back to it. Everything is
 * saved locally (timers are timestamps), so a reload never loses progress.
 */
const current = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null

async function latest(): Promise<string | null> {
  try {
    const r = await fetch('/', { cache: 'no-store' })
    if (!r.ok) return null
    const m = (await r.text()).match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function watchForUpdates() {
  const mine = current()
  if (!mine || import.meta.env.DEV) return
  let checking = false
  const check = async () => {
    if (checking || document.visibilityState !== 'visible') return
    checking = true
    const next = await latest()
    checking = false
    if (!next || next === mine) return
    // reload once per new build — never loop if the page still comes back stale
    try {
      if (sessionStorage.getItem('planet:reloaded-for') === next) return
      sessionStorage.setItem('planet:reloaded-for', next)
    } catch {
      return
    }
    location.reload()
  }
  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  window.setInterval(check, 5 * 60_000)
  check()
}
