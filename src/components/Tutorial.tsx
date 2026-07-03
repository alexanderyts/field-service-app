import { useEffect, useState } from 'react'
import ModalPortal from '../ModalPortal'

const TUTORIAL_KEY = 'fieldservice_tutorial_seen'

export function hasSeenTutorialPrompt(): boolean {
  try { return localStorage.getItem(TUTORIAL_KEY) === 'yes' } catch { return false }
}

export function markTutorialPromptSeen() {
  try { localStorage.setItem(TUTORIAL_KEY, 'yes') } catch {}
}

export type TutorialTab = 'contacts' | 'schedule' | 'map' | 'reports' | 'misc'

interface TutorialStep {
  icon: string
  title: string
  body: string
  /** Switches to this tab so the step matches what's on the real screen behind it. */
  tab?: TutorialTab
  /** CSS selector for the real on-screen element to spotlight; falls back to a plain
      dimmed screen if the element isn't present (e.g. the minute bank pill when it's empty). */
  highlight?: string
}

// A short, tab-by-tab overview rather than a granular button-by-button walkthrough —
// each step highlights that tab's own button in the bar below so it's obvious which
// tab is being described. Schedule gets three stops since it's the deepest tab.
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '👋',
    title: 'Welcome to Field Service',
    body: "A quick tour of each tab — under a minute. Replay anytime from More.",
    tab: 'contacts',
    highlight: '[data-tutorial="tabbar"]',
  },
  {
    icon: '◎',
    title: 'Ministry',
    body: "Your home base. Tap \"+ New Entry\" for a Contact (name, tags, calls, return visits) or a Street, where you track house numbers with a quick number pad. Streets are also created when you trace a territory on the Map.",
    tab: 'contacts',
    highlight: '[data-tutorial="tab-contacts"]',
  },
  {
    icon: '◫',
    title: 'Schedule · Your Goals',
    body: "Answer a few questions once, and the top panel tracks your week, month, and service year. Pioneering this month? Flip it on and targets adjust.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
  },
  {
    icon: '🗓️',
    title: 'Schedule · Plan Your Week',
    body: "Tap any day to plan it — stack different kinds of time, then repeat weekly or keep it to that date. The calendar color-codes planned and completed days.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
  },
  {
    icon: '⏱',
    title: 'Schedule · The Minute Bank',
    body: "Log time with Add Time — leftover minutes bank automatically and roll into a full hour, or tap the bank to cash them in. No minute is lost.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
  },
  {
    icon: '◈',
    title: 'Map',
    body: "Contacts with an address are pinned here, color-coded by status. Trace a temporary territory, mark streets done, and it counts toward your reports — each street also lands in Ministry for house numbers.",
    tab: 'map',
    highlight: '[data-tutorial="tab-map"]',
  },
  {
    icon: '▦',
    title: 'Reports',
    body: "Tap Run Report for a monthly and service-year overview — hours, goals, territories — and email it in one tap.",
    tab: 'reports',
    highlight: '[data-tutorial="tab-reports"]',
  },
  {
    icon: '⋯',
    title: 'More',
    body: "Pick a theme, adjust app settings, replay this tour, or review privacy and legal. Everything stays on your device — always.",
    tab: 'misc',
    highlight: '[data-tutorial="tab-misc"]',
  },
  {
    icon: '🙏',
    title: 'Thank you',
    body: "Thanks for giving this app a try — I hope it makes tracking your ministry a little easier!\n\n— Alexander",
  },
]

export function TutorialPrompt({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onNo}>
      <div className="modal tutorial-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-icon">👋</div>
        <h3 style={{ textAlign: 'center' }}>Welcome to Field Service</h3>
        <p className="muted" style={{ textAlign: 'center' }}>
          Want a quick guided tour of the app's main features? Takes about a minute.
        </p>
        <div className="row">
          <button onClick={onYes}>Yes, show me around</button>
          <button className="secondary" onClick={onNo}>No thanks</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// Every highlight target is the bottom tab bar these days, so "place it below the
// highlight" is never viable — the card just anchors near the top instead. Its own
// max-height + overflow (see .tutorial-card in App.css) is what actually guarantees it
// can never grow tall enough to reach back down and cover the bar, regardless of how
// long a given step's text runs — no per-step height guessing needed.

export default function Tutorial({
  currentTab,
  onNavigate,
  onClose,
}: {
  currentTab: TutorialTab
  onNavigate: (tab: TutorialTab) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const isLast = step === TUTORIAL_STEPS.length - 1
  const current = TUTORIAL_STEPS[step]

  // Switch to whichever tab this step is about, so the real screen behind the
  // overlay matches what's being explained.
  useEffect(() => {
    if (current.tab && current.tab !== currentTab) onNavigate(current.tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Re-measure the highlighted element after the tab switch/step change has had a
  // chance to render, and again on resize so the spotlight keeps tracking it.
  useEffect(() => {
    function measure() {
      if (!current.highlight) { setRect(null); return }
      const el = document.querySelector(current.highlight)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    const t = window.setTimeout(measure, 80)
    window.addEventListener('resize', measure)
    return () => { window.clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [step, currentTab, current.highlight])

  return (
    <ModalPortal>
    <div className="tutorial-overlay">
      {rect ? (
        <div
          className="tutorial-hole"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="tutorial-dim" />
      )}

      <div className="tutorial-card">
        <button className="icon-btn tutorial-skip" onClick={onClose} title="Skip tour">×</button>

        <div className="tutorial-icon">{current.icon}</div>
        <h3 style={{ textAlign: 'center' }}>{current.title}</h3>
        <p style={{ textAlign: 'center', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{current.body}</p>

        <div className="tutorial-dots">
          {TUTORIAL_STEPS.map((_, i) => (
            <span key={i} className={`tutorial-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        <div className="row">
          {step > 0 && (
            <button className="secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <button onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}>
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
