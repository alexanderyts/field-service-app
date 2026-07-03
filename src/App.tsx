import { useState, useEffect, lazy, Suspense } from 'react'
import Contacts from './components/Contacts'
import Schedule from './components/Schedule'
import Reports from './components/Reports'
import Misc from './components/Misc'
import { SplashScreen, PrivacyGate, hasAcceptedPolicy } from './components/Onboarding'
import Tutorial, { TutorialPrompt, hasSeenTutorialPrompt, markTutorialPromptSeen } from './components/Tutorial'
import { checkReturnVisitNotifications } from './notifications'
import './App.css'

// Map is the one tab worth deferring — Leaflet alone is ~150KB. The other four are
// small enough that lazy-loading them just adds a Suspense flash on every switch
// (visible jank) for a bundle-size win that isn't worth it at their size.
const MapView = lazy(() => import('./components/MapView'))

type Tab = 'contacts' | 'schedule' | 'map' | 'reports' | 'misc'
type Phase = 'splash' | 'splash-out' | 'policy' | 'app'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'contacts', label: 'Ministry', icon: '◎' },
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
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('splash-out'), 1800)
    const t2 = setTimeout(() => setPhase(hasAcceptedPolicy() ? 'app' : 'policy'), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Offer the guided tour once, the first time the app phase is reached on this device.
  useEffect(() => {
    if (phase === 'app' && !hasSeenTutorialPrompt()) {
      setShowTutorialPrompt(true)
    }
  }, [phase])

  // Return-visit reminders only fire while the app is actually open (no backend to wake
  // the phone otherwise) — checked once on reaching the app, then every few minutes for
  // as long as it stays open, so a visit that enters its lead window while someone's
  // mid-session still gets caught.
  useEffect(() => {
    if (phase !== 'app') return
    checkReturnVisitNotifications()
    const interval = window.setInterval(checkReturnVisitNotifications, 5 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [phase])

  // The splash screen is a fixed dark-green overlay; without this, any gap around it
  // (e.g. the home-indicator safe area on iOS) shows the page's own cream background
  // instead, which reads as a stray white/light bar at the bottom of the screen.
  useEffect(() => {
    const isSplash = phase === 'splash' || phase === 'splash-out'
    document.body.style.background = isSplash ? '#0f2921' : ''
  }, [phase])

  // Switching tabs is a hard content swap (unmount/mount), not real navigation — without
  // this, whatever scroll position the previous tab was left at carries over, which
  // reads as a jarring jump/snap on the new (usually shorter) content. The page itself
  // scrolls now (not a nested div), so this scrolls the window.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  function selectTab(next: Tab) {
    setTab(next)
    // Real haptic feedback (the Taptic Engine) isn't reachable from web content on
    // iOS at all — Safari has never implemented the Vibration API, in-browser or
    // installed as a PWA; only a native app can trigger it. This still fires on
    // Android Chrome, and costs nothing to leave in for when it's supported.
    navigator.vibrate?.(10)
  }

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
        <Suspense fallback={<div className="tab-loading" />}>
          <div key={tab} className="tab-content">
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
            {tab === 'misc' && <Misc onReplayTutorial={() => setShowTutorial(true)} />}
          </div>
        </Suspense>
      </main>

      <nav className="tabbar" data-tutorial="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'active' : ''}
            data-tutorial={`tab-${t.key}`}
            onClick={() => selectTab(t.key)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {showTutorialPrompt && (
        <TutorialPrompt
          onYes={() => {
            markTutorialPromptSeen()
            setShowTutorialPrompt(false)
            setShowTutorial(true)
          }}
          onNo={() => {
            markTutorialPromptSeen()
            setShowTutorialPrompt(false)
          }}
        />
      )}

      {showTutorial && <Tutorial currentTab={tab} onNavigate={setTab} onClose={() => setShowTutorial(false)} />}
    </div>
  )
}

export default App
