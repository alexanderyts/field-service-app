import { useState, useEffect } from 'react'
import Contacts from './components/Contacts'
import MapView from './components/MapView'
import Schedule from './components/Schedule'
import Reports from './components/Reports'
import Misc from './components/Misc'
import { SplashScreen, PrivacyGate, hasAcceptedPolicy } from './components/Onboarding'
import './App.css'

type Tab = 'contacts' | 'schedule' | 'map' | 'reports' | 'misc'
type Phase = 'splash' | 'splash-out' | 'policy' | 'app'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'contacts', label: 'Contacts', icon: '◎' },
  { key: 'schedule', label: 'Schedule', icon: '◫' },
  { key: 'map', label: 'Map', icon: '◈' },
  { key: 'reports', label: 'Reports', icon: '▦' },
  { key: 'misc', label: 'More', icon: '⋯' },
]

function App() {
  const [tab, setTab] = useState<Tab>('contacts')
  const [openContactId, setOpenContactId] = useState<number | null>(null)
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; personId: number } | null>(null)
  const [phase, setPhase] = useState<Phase>('splash')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('splash-out'), 1800)
    const t2 = setTimeout(() => setPhase(hasAcceptedPolicy() ? 'app' : 'policy'), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (phase === 'splash' || phase === 'splash-out') {
    return <SplashScreen leaving={phase === 'splash-out'} />
  }
  if (phase === 'policy') {
    return <PrivacyGate onAccept={() => setPhase('app')} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand-mark" />
        <h1>Field Service</h1>
      </header>

      <main className="app-main">
        {tab === 'contacts' && (
          <Contacts
            openContactId={openContactId}
            onOpenedContact={() => setOpenContactId(null)}
            onGoToMap={(lat, lng, personId) => { setMapFocus({ lat, lng, personId }); setTab('map') }}
          />
        )}
        {tab === 'schedule' && (
          <Schedule
            onGoToContact={(id) => {
              setOpenContactId(id)
              setTab('contacts')
            }}
          />
        )}
        {tab === 'map' && (
          <MapView
            focusLocation={mapFocus}
            onGoToContact={(id) => { setOpenContactId(id); setTab('contacts') }}
          />
        )}
        {tab === 'reports' && <Reports />}
        {tab === 'misc' && <Misc />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
