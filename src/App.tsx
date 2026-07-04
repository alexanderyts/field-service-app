import { useState, useEffect, lazy, Suspense } from 'react'
import Contacts from './components/Contacts'
import { SplashScreen, PrivacyGate, ProfileGate, hasAcceptedPolicy } from './components/Onboarding'
import { hasSeenProfilePrompt } from './profile'
import Tutorial, { TutorialPrompt, hasSeenTutorialPrompt, markTutorialPromptSeen } from './components/Tutorial'
import InstallBanner from './components/InstallPrompt'
import ImportConfirm from './components/ImportConfirm'
import { parseImportHash } from './share'
import { requestPersistentStorage } from './pwaInstall'
import { checkReturnVisitNotifications } from './notifications'
import './App.css'

// Read a scanned deep-link (`#i=…`) once, at module load, before React mounts — then strip
// the hash immediately so a later reload can't re-import the same item. Whatever's captured
// here is offered as an import (see ImportConfirm) after the app reaches its main phase.
const initialImport: string | null = (() => {
  try {
    const encoded = parseImportHash(window.location.hash)
    if (encoded) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    return encoded
  } catch {
    return null
  }
})()

// Contacts is the default tab, so it stays eagerly imported (no Suspense flash on first
// paint). Everything else is code-split: Map pulls in Leaflet (~150KB), and Schedule is a
// 3k-line component — deferring these off the initial bundle cuts first-paint JS/parse.
// The one-time Suspense flash on first visit to each of these tabs is a fine trade.
const Schedule = lazy(() => import('./components/Schedule'))
const Reports = lazy(() => import('./components/Reports'))
const Misc = lazy(() => import('./components/Misc'))
const MapView = lazy(() => import('./components/MapView'))

type Tab = 'contacts' | 'schedule' | 'map' | 'reports' | 'misc'
type Phase = 'splash' | 'splash-out' | 'policy' | 'profile' | 'app'

function nextPhase(): Phase {
  if (!hasAcceptedPolicy()) return 'policy'
  if (!hasSeenProfilePrompt()) return 'profile'
  return 'app'
}

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
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; personId?: number } | null>(null)
  // Set when "New Custom Territory" is picked from the Ministry chooser — switches to the Map
  // tab, which opens the drawing tool and clears this (so it's consumed exactly once, even
  // though the Map tab mounts fresh on the switch).
  const [pendingDraw, setPendingDraw] = useState(false)
  const [phase, setPhase] = useState<Phase>('splash')
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  // A share opened via a scanned deep-link or a picked .meleo file — shown as an import
  // prompt once the app is fully reached (a brand-new device still gates on policy/name).
  const [pendingImport, setPendingImport] = useState<string | null>(initialImport)

  // The word-transformation animation (see .splash-* in App.css) runs to about 2.05s on its
  // own; hold long enough to let it finish and settle (~450ms rest) before fading out, over
  // the same 0.4s the .splash-out keyframe already uses.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('splash-out'), 2450)
    const t2 = setTimeout(() => setPhase(nextPhase()), 2850)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Offer the guided tour once, the first time the app phase is reached on this device.
  useEffect(() => {
    if (phase === 'app' && !hasSeenTutorialPrompt()) {
      setShowTutorialPrompt(true)
    }
  }, [phase])

  // Ask the browser to keep our IndexedDB out of routine eviction. Best-effort — some
  // browsers only grant it once the app is installed/engaged, so it's harmless to request
  // on every launch (it re-checks and no-ops if already granted or unsupported).
  useEffect(() => {
    if (phase === 'app') void requestPersistentStorage()
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

  // The splash screen is a fixed cream overlay; without this, any gap around it (e.g. the
  // home-indicator safe area on iOS) shows the page's default background instead, which can
  // read as a mismatched flash at the edges of the screen.
  useEffect(() => {
    const isSplash = phase === 'splash' || phase === 'splash-out'
    document.body.style.background = isSplash ? '#f3f1ec' : ''
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
    return <PrivacyGate onAccept={() => setPhase(nextPhase())} />
  }
  if (phase === 'profile') {
    return <ProfileGate onDone={() => setPhase('app')} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand-mark" />
        <h1>Meleo</h1>
      </header>

      <InstallBanner />

      <main className="app-main">
        <Suspense fallback={<div className="tab-loading" />}>
          <div key={tab} className="tab-content">
            {tab === 'contacts' && (
              <Contacts
                openContactId={openContactId}
                onOpenedContact={() => setOpenContactId(null)}
                onGoToMap={(lat, lng, personId) => { setMapFocus({ lat, lng, personId }); setTab('map') }}
                onImportEncoded={setPendingImport}
                onNewTerritory={() => { setPendingDraw(true); setTab('map') }}
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
                pendingDraw={pendingDraw}
                onDrawConsumed={() => setPendingDraw(false)}
              />
            )}
            {tab === 'reports' && <Reports />}
            {tab === 'misc' && <Misc onReplayTutorial={() => setShowTutorial(true)} onImportEncoded={setPendingImport} />}
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

      {pendingImport && <ImportConfirm encoded={pendingImport} onClose={() => setPendingImport(null)} />}
    </div>
  )
}

export default App
