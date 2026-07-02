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

// A short, one-stop-per-tab overview rather than a granular button-by-button walkthrough
// — each step highlights that tab's own button in the bar below so it's obvious which
// tab is being described, then moves on.
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '👋',
    title: 'Welcome to Field Service',
    body: "A quick look at what each tab does — about 30 seconds. Replay it anytime from the More tab.",
    tab: 'contacts',
    highlight: '[data-tutorial="tabbar"]',
  },
  {
    icon: '◎',
    title: 'Contacts',
    body: "Keep track of everyone you talk to in the ministry. Add a contact (just a name is required — typing an address looks up the real one for you), tag their status, and log call history with scriptures shared and follow-up dates.",
    tab: 'contacts',
    highlight: '[data-tutorial="tab-contacts"]',
  },
  {
    icon: '◫',
    title: 'Schedule',
    body: "Answer a few questions once and this tab tracks your progress toward your goals, suggests which days to go out, and logs your time — with automatic minute-banking so leftover minutes are never lost.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
  },
  {
    icon: '◈',
    title: 'Map',
    body: "Every contact with an address is pinned here automatically, color-coded by status. You can also trace out a temporary territory — a group of streets you're working — to keep track of what's left and mark it done.",
    tab: 'map',
    highlight: '[data-tutorial="tab-map"]',
  },
  {
    icon: '▦',
    title: 'Reports',
    body: "Tap Run Report anytime for an overview of your month and year, including progress toward any goals you've set.",
    tab: 'reports',
    highlight: '[data-tutorial="tab-reports"]',
  },
  {
    icon: '⋯',
    title: 'More',
    body: "Turn on credit hours, try Dark Mode, back up your data, replay this tour, or review your privacy settings. Everything you enter stays on this device — always.",
    tab: 'misc',
    highlight: '[data-tutorial="tab-misc"]',
  },
  {
    icon: '🙏',
    title: 'Thank you',
    body: "Thanks so much for giving this app a try — I built it hoping it'd make keeping track of your ministry just a little easier. I hope you enjoy using it!\n\n— Alexander",
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
