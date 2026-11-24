import { useEffect, useState } from 'react'

export type Route = 'now' | 'plan' | 'day' | 'summary' | 're'
const ROUTES: Route[] = ['now', 'plan', 'day', 'summary']

/** /re is a real path (recovery page); everything else lives in the hash */
const onRecover = () => window.location.pathname.replace(/\/+$/, '') === '/re'

const read = (): Route => {
  if (onRecover()) return 're'
  const h = window.location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'now'
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    window.addEventListener('popstate', on)
    return () => {
      window.removeEventListener('hashchange', on)
      window.removeEventListener('popstate', on)
    }
  }, [])
  return route
}

export const go = (r: Route) => {
  if (r === 're') {
    window.location.href = '/re'
    return
  }
  const hash = r === 'now' ? '#/' : `#/${r}`
  if (onRecover()) {
    // leave the recovery page for the app
    window.history.pushState(null, '', '/' + hash)
    window.dispatchEvent(new PopStateEvent('popstate'))
    return
  }
  window.location.hash = hash.slice(1)
}
