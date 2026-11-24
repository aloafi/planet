import { useCallback, useEffect, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { useRoute } from './lib/route'
import { currentBlock, remainingOf, elapsedOf } from './lib/engine'
import { clock, stopwatch } from './lib/format'
import { t as tr } from './lib/i18n'
import { Now } from './components/Now'
import { Plan } from './components/Plan'
import { Day } from './components/Day'
import { Summary } from './components/Summary'
import { Nav, SettingsSheet, UndoToast } from './components/Chrome'

function Shell() {
  const route = useRoute()
  const { state, now } = useStore()
  const [settings, setSettings] = useState(false)
  const closeSettings = useCallback(() => setSettings(false), [])
  const b = state.run.phase === 'active' ? currentBlock(state) : null
  const mode = b?.type === 'break' ? 'break' : 'task'

  useEffect(() => {
    document.body.dataset.mode = route === 'now' ? mode : 'task'
  }, [mode, route])

  // live countdown in the tab title
  const t = state.run.timer
  let title = 'planet'
  if (b) {
    const rem = remainingOf(b, t, now)
    const time = rem == null ? stopwatch(elapsedOf(t, now)) : clock(rem)
    const label = b.type === 'break' ? tr('break') : b.name || tr('task')
    title = `${t.status === 'paused' ? '❚❚ ' : ''}${time} · ${label}`
  }
  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <>
      <Nav route={route} onSettings={() => setSettings(true)} />
      <div className="view" key={route}>
        {route === 'now' && <Now />}
        {route === 'plan' && <Plan />}
        {route === 'day' && <Day />}
        {route === 'summary' && <Summary />}
      </div>
      <UndoToast />
      {settings && <SettingsSheet onClose={closeSettings} />}
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
