import { useEffect, useState } from 'react'
import ModalPortal from '../ModalPortal'
import contactShot from '../assets/tutorial/contact.webp'


export type TutorialTab = 'contacts' | 'schedule' | 'reports' | 'misc'

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
    icon: '◫',
    title: 'Log your time',
    body: "Tap Log time when you're done, or start the timer as you head out and stop it when you're back. Odd minutes are never rounded up — they bank toward the next hour.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
    live: 'minutebank',
    imageAlt: 'A minute-bank pill showing 45 minutes filling toward an hour.',
  },
  {
    icon: '◫',
    title: 'Today',
    body: "Today's return visits sit at the top of Service. At the door, tap Log visit — Talked or Not home, and the next visit is one tap: Tomorrow, +1 week, +2 weeks.",
    tab: 'schedule',
    highlight: '[data-tutorial="tab-schedule"]',
  },
  {
    icon: '◎',
    title: 'People',
    body: "Everyone you meet, with every visit and what you talked about. Switch to Map to see where they are.",
    tab: 'contacts',
    highlight: '[data-tutorial="tab-contacts"]',
    image: contactShot,
    imageAlt: 'A contact with a Return Visit status, address, and a history of visits.',
  },
  {
    icon: '▦',
    title: 'Your report',
    body: "At month's end your report is ready in the order the form asks. Tap Copy beside each figure to paste it into NW Publisher, or Share it — then Mark as submitted.",
    tab: 'reports',
    highlight: '[data-tutorial="tab-reports"]',
  },
  {
    icon: '⋯',
    title: 'More',
    body: "Back up your data, change settings, turn on Streets & territories, and replay this tour.",
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
  const steps = TUTORIAL_STEPS
  const isLast = step === steps.length - 1
  const current = steps[Math.min(step, steps.length - 1)]

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
    <ModalPortal onClose={onClose}>
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
        <button className="icon-btn tutorial-skip" onClick={onClose} title="Skip tour" aria-label="Skip tour">×</button>

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
          {steps.map((_, i) => (
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
