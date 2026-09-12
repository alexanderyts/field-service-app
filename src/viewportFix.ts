/**
 * Installed-iOS launch-viewport correction (AUDIT F-6.1; see docs/wave5-plan.md §A).
 *
 * On an installed iOS web app (and WKWebView) the layout viewport comes up SHORT on launch —
 * WebKit subtracts the top safe-area inset from the bottom, so `innerHeight` reads about
 * `screen.height − 60` until a later native layout pass (usually the first scroll, or the
 * document becoming taller than the viewport) corrects it. Nothing fires for the flip
 * (WebKit bug 191872). A `position: fixed; bottom:` element is therefore drawn ~60px above the
 * true screen edge and "settles" only once something triggers the correction.
 *
 * The fix, ported from the sister app's on-device-verified solution: expose the shortfall as
 * `--deficit` on <html> so bottom-fixed elements subtract it, and keep the document at least
 * screen-height tall in the launch state so the correction fires within ~40ms. Both are no-ops
 * once corrected (deficit 0, nothing taller than the viewport). Pure `viewportDeficit` is
 * tested; the installer is DOM glue.
 */

/** Screen height minus innerHeight, portrait + standalone only, clamped to a plausible range;
    0 in a browser tab (where innerHeight legitimately excludes toolbars) or landscape. */
export function viewportDeficit(screenH: number, innerH: number, innerW: number, standalone: boolean): number {
  if (!standalone || innerW > innerH) return 0
  const d = Math.round(screenH - innerH)
  return d > 0 && d <= 120 ? d : 0
}

export function isStandalone(): boolean {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  )
}

/** A muted one-liner for the More tab so the owner can confirm the fix on device without a
    debugger. The safe-area inset must be read off a measured probe — a computed CSS var just
    echoes `env(...)`. */
export function viewportDiag(): string {
  let insetBottom = 0
  try {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom,0px)'
    document.body.appendChild(probe)
    insetBottom = Math.round(parseFloat(getComputedStyle(probe).paddingBottom) || 0)
    probe.remove()
  } catch { /* ignore */ }
  const d = viewportDeficit(screen.height, window.innerHeight, window.innerWidth, isStandalone())
  return `screen ${screen.width}×${screen.height} · inner ${window.innerWidth}×${window.innerHeight} · inset bottom ${insetBottom} · deficit ${d}`
}

/** Installs the watcher. Returns a disposer (mainly for tests / HMR — the app calls it once
    for the process lifetime). */
export function installViewportFix(): () => void {
  const de = document.documentElement
  const standalone = isStandalone()
  let last = -1
  let rafId = 0

  const sync = () => {
    const d = viewportDeficit(screen.height, window.innerHeight, window.innerWidth, standalone)
    if (standalone) {
      const portrait = window.innerWidth <= window.innerHeight
      // A persistently-taller-than-viewport document is what triggers WebKit's correction;
      // a no-op once corrected (viewport == screen height, nothing becomes scrollable).
      de.style.minHeight = portrait ? `${screen.height}px` : ''
    }
    if (d !== last) {
      last = d
      de.style.setProperty('--deficit', `${d}px`)
    }
  }

  // WebKit fires no event for the correction, so poll each frame while visible (one
  // subtraction per frame — free). Stops when the tab is hidden.
  const loop = () => {
    if (document.visibilityState === 'visible') sync()
    rafId = requestAnimationFrame(loop)
  }

  const events = ['resize', 'orientationchange', 'pageshow', 'focus', 'scroll'] as const
  events.forEach((ev) => addEventListener(ev, sync, { passive: true }))
  document.addEventListener('visibilitychange', sync)
  window.visualViewport?.addEventListener('resize', sync)
  sync()
  rafId = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(rafId)
    events.forEach((ev) => removeEventListener(ev, sync))
    document.removeEventListener('visibilitychange', sync)
    window.visualViewport?.removeEventListener('resize', sync)
  }
}
