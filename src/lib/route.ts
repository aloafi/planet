import { useEffect, useState } from 'react'

export type Route = 'now' | 'plan' | 'day' | 'summary'
const ROUTES: Route[] = ['now', 'plan', 'day', 'summary']

const read = (): Route => {
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
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const go = (r: Route) => {
  window.location.hash = r === 'now' ? '/' : `/${r}`
}
