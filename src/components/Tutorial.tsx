import { useEffect, useState } from 'react'
import ModalPortal from '../ModalPortal'
import contactShot from '../assets/tutorial/contact.webp'
import scheduleWeekShot from '../assets/tutorial/schedule-week.webp'
import scheduleCalendarShot from '../assets/tutorial/schedule-calendar.webp'
import contactsMapShot from '../assets/tutorial/contacts-map.webp'
import streetShot from '../assets/tutorial/street.webp'
import territoryShot from '../assets/tutorial/territory.webp'
import reportShot from '../assets/tutorial/report.webp'

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
  /** A real in-app snapshot of the feature (captured with demo data), shown framed in the card. */
  image?: string
  /** Which part of a tall snapshot to keep when it's cropped to the frame. Defaults to 'top'
      (most screens lead with their key content); map snapshots use 'center' to hold the lines. */
  imageFocus?: 'top' | 'center'
  /** 'cover' (default) fills a tall frame; 'contain' shows a small element whole. */
  imageFit?: 'cover' | 'contain'
  /** Instead of a captured image, render a live replica of a small UI element (the minute-bank
      pill) using the app's real styles — crisper and theme-correct for a tiny chip that doesn't
      screenshot well in isolation. */
  live?: 'minutebank'
  /** Short alt text describing the snapshot for screen readers. */
  imageAlt?: string
  /** A signature line (e.g. "— Alex") rendered with deliberate spacing below the body, so it
      reads as a sign-off rather than an orphaned trailing line. */
  signoff?: string
}

// A short, tab-by-tab overview rather than a granular button-by-button walkthrough —
// each step highlights that tab's own button in the bar below so it's obvious which
// tab is being described. Each icon mirrors the real tab glyph in the bar. Kept brief
// and snappy: one stop per tab, plus a welcome and a thank-you.
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '👋',
    title: 'Welcome to Meleo',
    body: "Here's a quick look around — under a minute. You can replay it anytime from More.",
    tab: 'contacts',
    highlight: '[data-tutorial="tabbar"]',
  },
  {
    icon: '◎',
    title: 'Ministry',
    body: "Your home base for everyone you meet — log a call, jot what you talked about, and mark return visits so you never lose the thread.",
    tab: 'contacts',
    highlight: '[data-tutorial="tab-contacts"]',
    image: contactShot,
    imageAlt: 'A contact with a Return Visit tag, address, and a history of logged calls.',
  },
  {
    icon: '◫',
    title: 'Schedule · Your week',
    body: "Block out when you'll be out, then watch each day fill toward your goal as you log time.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
    image: scheduleWeekShot,
    imageAlt: 'A week of days with time-of-day bars and a weekly goal meter.',
  },
  {
    icon: '◫',
    title: 'Schedule · The month',
    body: "Zoom out to the whole month — each day's ring shows its share of your weekly goal, planned and done at a glance.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
    image: scheduleCalendarShot,
    imageAlt: 'A month calendar with a small goal ring above each day.',
  },
  {
    icon: '⏱',
    title: 'The minute bank',
    body: "Odd minutes never go to waste — leftover time banks up and rolls into a full hour on its own.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
    live: 'minutebank',
    imageAlt: 'A minute-bank pill showing 45 minutes filling toward an hour.',
  },
  {
    icon: '◈',
    title: 'Map · Your contacts',
    body: "Give a contact an address and they land here automatically — pinned on the map and colour-coded by status, so your territory takes shape as you go.",
    tab: 'map',
    highlight: '[data-tutorial="tab-map"]',
    image: contactsMapShot,
    imageFocus: 'center',
    imageAlt: 'A map with several contacts pinned across a neighborhood, colour-coded by status.',
  },
  {
    icon: '◈',
    title: 'Map · Trace a street',
    body: "Working a street? Trace it right on the map, so you always remember exactly where you've been. Your streets live in the Ministry tab, ready to manage anytime.",
    tab: 'map',
    highlight: '[data-tutorial="tab-map"]',
    image: streetShot,
    imageFocus: 'center',
    imageAlt: 'A street traced as a colored line on the map, matching the real road.',
  },
  {
    icon: '◈',
    title: 'Map · Territories',
    body: "Bundle a few streets into a custom territory — each one labelled, so the whole area stays organized. Find and manage your territories in the Ministry tab.",
    tab: 'map',
    highlight: '[data-tutorial="tab-map"]',
    image: territoryShot,
    imageFocus: 'center',
    imageAlt: 'Several labelled streets grouped into one custom territory on the map.',
  },
  {
    icon: '▦',
    title: 'Reports',
    body: "A warm recap of your month and service year — hours, categories, and little highlights worth celebrating.",
    tab: 'reports',
    highlight: '[data-tutorial="tab-reports"]',
    image: reportShot,
    imageAlt: 'A monthly report showing total hours, category breakdown, and highlights.',
  },
  {
    icon: '⋯',
    title: 'More',
    body: "Themes, settings, and a few handy extras — the place to make Meleo your own.",
    tab: 'misc',
    highlight: '[data-tutorial="tab-misc"]',
  },
  {
    icon: '🙏',
    title: 'Thank you',
    body: "It means so much that you're giving Meleo a try. It's been a joy to build, and I hope you find it useful.\n\nFeel free to check the More tab for information on how to pass on feedback, suggestions, or even a kind note.\n\nThanks again — it means more than you know. 😌",
    signoff: '— Alex',
  },
]

export function TutorialPrompt({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onNo}>
      <div className="modal tutorial-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-icon">👋</div>
        <h3 style={{ textAlign: 'center' }}>Welcome to Meleo</h3>
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

// Every highlight target is the bottom tab bar these days, so the card centers itself
// in the readable middle of the screen via a flex wrapper (.tutorial-card-wrap) whose
// bottom padding reserves the tab-bar zone — so the card is comfortably centered yet
// can never grow down far enough to cover the bar, regardless of how long the text runs.

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

      <div className="tutorial-card-wrap">
      <div className="tutorial-card">
        <button className="icon-btn tutorial-skip" onClick={onClose} title="Skip tour">×</button>

        {/* keyed so the icon/title/body cross-fade fresh on every step */}
        <div className="tutorial-step" key={step}>
          <div className="tutorial-icon">{current.icon}</div>
          <h3 style={{ textAlign: 'center' }}>{current.title}</h3>
          {current.live === 'minutebank' ? (
            <div className="tutorial-shot-live" role="img" aria-label={current.imageAlt}>
              <div className="minute-bank-pill" aria-hidden="true">
                <span>⏱ 45m</span>
                <div className="minute-bank-track"><div className="minute-bank-fill" style={{ width: '75%' }} /></div>
              </div>
            </div>
          ) : current.image ? (
            <img
              className={`tutorial-shot${current.imageFit === 'contain' ? ' contain' : ''}`}
              src={current.image}
              alt={current.imageAlt ?? ''}
              style={{ objectPosition: current.imageFocus === 'center' ? 'center' : 'top center' }}
            />
          ) : null}
          <p style={{ textAlign: 'center', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{current.body}</p>
          {current.signoff && <p className="tutorial-signoff">{current.signoff}</p>}
        </div>

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
    </div>
    </ModalPortal>
  )
}
