const ANIM_PREF_KEY = 'fieldservice_minute_bank_anim'
const FLIGHT_MS = 1700
/** Fraction of the flight where the ball actually reaches the pill (see the 82% keyframe
    in App.css) — the pill's little pulse (and the caller awaiting flyToMinuteBank) should
    land right at that moment, not at 100%, since the last stretch is just the ball fading
    out in place. */
const ARRIVAL_FRACTION = 0.82

export function minuteBankAnimationsEnabled(): boolean {
  try { return localStorage.getItem(ANIM_PREF_KEY) !== 'off' } catch { return true }
}

export function setMinuteBankAnimationsEnabled(v: boolean) {
  try { localStorage.setItem(ANIM_PREF_KEY, v ? 'on' : 'off') } catch { /* localStorage unavailable */ }
}

/** Fires a small flying stopwatch icon from the given element up to the minute-bank pill
    in the Add Time card — a quick, playful visual cue for where banked minutes go. The
    icon is appended straight to document.body (not through React) so it keeps flying and
    fading even after the modal that started it closes. Resolves once the icon visually
    reaches the pill (not once it's fully faded out), so callers can sync a follow-up
    effect — like counting the bank up — to the moment of "arrival". No-ops safely if
    either element isn't on screen, or if the user has turned the animation off. */
export function flyToMinuteBank(originEl: HTMLElement | null | undefined): Promise<void> {
  if (!originEl || !minuteBankAnimationsEnabled()) return Promise.resolve()
  // Prefer the pill itself (precise target once it exists); fall back to its wrapper for
  // the very first minute ever banked, when the pill hasn't rendered yet.
  const target = (document.querySelector('.minute-bank-pill') ??
    document.querySelector('[data-minute-bank-target]')) as HTMLElement | null
  if (!target) return Promise.resolve()

  const from = originEl.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const fromX = from.left + from.width / 2
  const fromY = from.top + from.height / 2
  const toX = to.left + to.width / 2
  const toY = to.top + to.height / 2
  const dx = toX - fromX
  const dy = toY - fromY

  // A gentle bend rather than a straight line, so the toss reads as having some weight —
  // but kept small and biased mostly toward the target (not perpendicular), so it never
  // reads as darting sideways before correcting hard back onto course.
  const dist = Math.hypot(dx, dy) || 1
  const perpX = -dy / dist
  const perpY = dx / dist
  const bulge = Math.min(16, dist * 0.1)
  const arcX = dx * 0.55 + perpX * bulge
  const arcY = dy * 0.55 + perpY * bulge

  const ball = document.createElement('div')
  ball.className = 'minute-bank-ball'
  ball.textContent = '⏱'
  ball.style.left = `${fromX}px`
  ball.style.top = `${fromY}px`
  ball.style.setProperty('--dx', `${dx}px`)
  ball.style.setProperty('--dy', `${dy}px`)
  ball.style.setProperty('--arcX', `${arcX}px`)
  ball.style.setProperty('--arcY', `${arcY}px`)
  document.body.appendChild(ball)
  ball.addEventListener('animationend', () => ball.remove())

  return new Promise((resolve) => {
    window.setTimeout(() => {
      target.classList.add('minute-bank-pulse')
      window.setTimeout(() => target.classList.remove('minute-bank-pulse'), 400)
      resolve()
    }, FLIGHT_MS * ARRIVAL_FRACTION)
  })
}

const COLLECT_MS = 420

/** Plays a quick "gathering" highlight+shrink on the field the minutes were entered in
    (see .minute-collecting in App.css), then launches the flying ball from that same spot
    once the field has visually shrunk away — so the ball reads as originating from the
    minutes just entered, not from wherever Save happened to be tapped. Resolves once the
    ball arrives at the bank. No-ops (and skips the artificial delay entirely) when
    minute-bank animations are turned off. */
export async function collectAndFlyToMinuteBank(fieldEl: HTMLElement | null | undefined) {
  if (!fieldEl || !minuteBankAnimationsEnabled()) return
  fieldEl.classList.add('minute-collecting')
  await new Promise((resolve) => window.setTimeout(resolve, COLLECT_MS))
  fieldEl.classList.remove('minute-collecting')
  await flyToMinuteBank(fieldEl)
}

/** Tweens a displayed integer from `from` to `to` over `durationMs`, calling `onUpdate` on
    every animation frame — used to count the bank pill up or down instead of it just
    jumping to the new value. Eases out (fast start, gentle settle) which reads naturally
    for a counter. Resolves once it reaches `to` exactly. No-ops (snaps straight to `to`)
    when minute-bank animations are turned off. */
export function animateBankValue(from: number, to: number, durationMs: number, onUpdate: (v: number) => void): Promise<void> {
  if (from === to || !minuteBankAnimationsEnabled()) {
    onUpdate(to)
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const start = performance.now()
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) * (1 - t)
      onUpdate(Math.round(from + (to - from) * eased))
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}
