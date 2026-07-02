import { useEffect, useState, type CSSProperties } from 'react'
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

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '👋',
    title: 'Welcome to Field Service',
    body: "This tour walks through the app on the real screens, highlighting things as we go. Takes about a minute — replay it anytime from the More tab. That's your navigation below.",
    tab: 'contacts',
    highlight: '[data-tutorial="tabbar"]',
  },
  {
    icon: '◎',
    title: 'Add a contact',
    body: "Tap + New Contact to add someone. Only a name is required — start typing a street address and it looks up the real address as you type, so the Map pin lands in the right spot. Tag each contact (Interested, Return Visit, Bible Study, Informal Visit, and more).",
    tab: 'contacts',
    highlight: '[data-tutorial="new-contact-btn"]',
  },
  {
    icon: '🗣️',
    title: 'Call History & visits',
    body: "Open any contact and you can log a call: what was discussed, scriptures shared, literature placed, and an optional follow-up date. Not home? Mark it and note what you left at the door.",
    tab: 'contacts',
  },
  {
    icon: '◫',
    title: 'Schedule',
    body: "Answer a few questions once and this tab tracks your weekly and yearly progress, suggests which days to go out, and has a calendar view showing suggested days and return visits together.",
    tab: 'schedule',
  },
  {
    icon: '🔢',
    title: 'Add Time',
    body: "Tap here to log time — pick hours and minutes with the number pad, choose a category, and save. Turn on credit hours in More to also see LDC, Convention, Assembly, Bethel, and Other.",
    tab: 'schedule',
    highlight: '[data-tutorial="add-time-btn"]',
  },
  {
    icon: '🏦',
    title: 'How minutes get banked',
    body: "Leftover minutes from 1–29 are banked automatically — nothing to round yourself. Enter 30–59 leftover minutes and it asks whether to round up to the next hour or bank them instead. Once the bank reaches 60 minutes, it automatically logs a full hour for you. This pill shows up whenever your bank is holding onto minutes.",
    tab: 'schedule',
    highlight: '[data-tutorial="minute-bank"]',
  },
  {
    icon: '▦',
    title: 'Reports',
    body: "Tap Run Report anytime for a nice overview of your month and year — a good way to reflect on your progress in the ministry. If you've set a yearly goal, you'll see progress toward it too, with credit hours capped at 55h/month and your true total always shown alongside it.",
    tab: 'reports',
    highlight: '[data-tutorial="run-report-btn"]',
  },
  {
    icon: '◈',
    title: 'Map',
    body: "Every contact with an address is pinned here automatically, color-coded by status so you can see your territory at a glance.",
    tab: 'map',
    highlight: '[data-tutorial="map-view"]',
  },
  {
    icon: '⋯',
    title: 'More',
    body: "Turn on credit hours, try Dark Mode (beta), replay this tour, or review your privacy settings. Everything you enter stays on this device — always.",
    tab: 'misc',
    highlight: '[data-tutorial="credit-toggle"]',
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

/** Places the instruction card below the highlighted element, or above it if there's not enough room below. */
function cardStyle(rect: DOMRect | null): CSSProperties {
  if (!rect) return {}
  const viewportH = window.innerHeight
  const estimatedCardHeight = 260
  const spaceBelow = viewportH - rect.bottom
  if (spaceBelow > estimatedCardHeight || spaceBelow > rect.top) {
    return { top: Math.min(rect.bottom + 14, viewportH - 40) }
  }
  return { top: Math.max(16, rect.top - estimatedCardHeight) }
}

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

      <div className={`tutorial-card${rect ? '' : ' centered'}`} style={cardStyle(rect)}>
        <button className="icon-btn tutorial-skip" onClick={onClose} title="Skip tour">×</button>

        <div className="tutorial-icon">{current.icon}</div>
        <h3 style={{ textAlign: 'center' }}>{current.title}</h3>
        <p style={{ textAlign: 'center', lineHeight: 1.6 }}>{current.body}</p>

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
