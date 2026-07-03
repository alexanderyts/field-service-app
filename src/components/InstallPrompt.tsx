import { useEffect, useReducer, useState } from 'react'
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '../pwaInstall'

const DISMISS_KEY = 'fieldservice_install_dismissed'

/** The install call-to-action itself, shared by the top banner and the More-tab card so the
    wording can't drift. Chromium gets a one-tap Install button; iOS gets the manual Share →
    Add to Home Screen steps; anything else gets a generic hint. */
function InstallBody({ onInstalled }: { onInstalled?: () => void }) {
  const ios = isIos()
  const canPrompt = canPromptInstall()

  if (canPrompt) {
    return (
      <button
        onClick={async () => {
          const outcome = await promptInstall()
          if (outcome === 'accepted') onInstalled?.()
        }}
      >
        Install app
      </button>
    )
  }

  if (ios) {
    return (
      <p className="install-steps">
        Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
      </p>
    )
  }

  return (
    <p className="install-steps">
      Open your browser's menu and choose <strong>Install</strong> or <strong>Add to Home Screen</strong>.
    </p>
  )
}

/** A dismissible top banner nudging testers to install, shown until they install or dismiss.
    Installing is what protects their data from iOS's 7-day storage eviction, so it's worth a
    gentle prompt. Never shown once the app is already installed (standalone). */
export default function InstallBanner() {
  const [, force] = useReducer((n) => n + 1, 0)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === 'yes' } catch { return false }
  })

  useEffect(() => subscribeInstall(force), [])

  if (dismissed || isStandalone()) return null
  // Nothing actionable to show yet (e.g. Chromium hasn't fired its install event, or a
  // browser that can't install) — stay hidden rather than showing an empty bar.
  if (!isIos() && !canPromptInstall()) return null

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, 'yes') } catch { /* ignore */ }
  }

  return (
    <div className="install-banner">
      <span className="install-banner-icon">📲</span>
      <div className="install-banner-text">
        <strong>Add Field Service to your Home Screen</strong>
        <span> so your data stays safe and it opens like a real app.</span>
        <div className="install-banner-action">
          <InstallBody onInstalled={dismiss} />
        </div>
      </div>
      <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  )
}

/** Always-available install section for the More tab — unlike the banner it's never
    dismissed, so someone who closed the banner can still find how to install, and it
    confirms the installed state once they have. */
export function InstallCard() {
  const [, force] = useReducer((n) => n + 1, 0)
  useEffect(() => subscribeInstall(force), [])

  if (isStandalone()) {
    return (
      <div className="card">
        <strong>📲 Installed</strong>
        <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          Field Service is running from your Home Screen — your data is protected from the
          browser's automatic 7-day cleanup. You're all set.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <strong>📲 Add to Home Screen</strong>
      <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
        Install the app so it opens like a native app — and, importantly, so your device
        doesn't clear your data after a week of not opening it.
      </p>
      <InstallBody />
    </div>
  )
}
