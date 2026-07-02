const ANIM_PREF_KEY = 'fieldservice_minute_bank_anim'

export function minuteBankAnimationsEnabled(): boolean {
  try { return localStorage.getItem(ANIM_PREF_KEY) !== 'off' } catch { return true }
}

export function setMinuteBankAnimationsEnabled(v: boolean) {
  try { localStorage.setItem(ANIM_PREF_KEY, v ? 'on' : 'off') } catch { /* localStorage unavailable */ }
}

function findBankTarget(): HTMLElement | null {
  // Prefer the pill itself (once it exists); otherwise fall back to the small fixed anchor
  // rendered right where the pill will appear — so the very first coin ever banked still
  // has a precise, stable landing spot instead of the pill's whole wrapper row.
  return (document.querySelector('.minute-bank-pill') ??
    document.querySelector('.minute-bank-anchor')) as HTMLElement | null
}

const FLIGHT_MS = 950

/** Fires a small flying stopwatch icon from the given element to the minute-bank pill (or
    its anchor, before the pill exists) — a quick, playful visual cue for where banked
    minutes go. Runs as a rAF loop that re-reads the target's live position every frame
    (rather than a fixed CSS keyframe path), so it keeps a correct, stable-looking
    trajectory even if the page scrolls or reflows mid-flight. Only ever writes
    `transform`/`opacity` (no layout-triggering properties), and the icon is appended
    straight to document.body so it survives the modal that started it closing mid-flight.
    Resolves once the icon visually reaches the pill (not once it's fully faded out), so
    callers can sync a follow-up effect — like counting the bank up — to the moment of
    "arrival". No-ops safely if either element isn't on screen, or if the user has turned
    the animation off. */
export function flyToMinuteBank(originEl: HTMLElement | null | undefined): Promise<void> {
  if (!originEl || !minuteBankAnimationsEnabled()) return Promise.resolve()
  if (!findBankTarget()) return Promise.resolve()

  const from = originEl.getBoundingClientRect()
  const startX = from.left + from.width / 2
  const startY = from.top + from.height / 2

  const ball = document.createElement('div')
  ball.className = 'minute-bank-ball'
  ball.textContent = '⏱'
  document.body.appendChild(ball)

  return new Promise((resolve) => {
    const start = performance.now()
    // Target position is re-read only every few frames (and smoothly interpolated toward
    // in between) instead of every frame: getBoundingClientRect forces a synchronous
    // layout flush, and during this flight the Add Time card is usually mid-collapse —
    // one forced layout per frame on top of that transition was the main source of
    // stutter. The path still tracks scrolls/reflows, just at 15Hz instead of 60Hz,
    // which is imperceptible for a sub-second flight.
    let endX = 0
    let endY = 0
    let frameCount = 0

    function frame(now: number) {
      const t = Math.min(1, (now - start) / FLIGHT_MS)
      if (frameCount % 4 === 0 || t >= 1) {
        const target = findBankTarget()
        if (!target) { ball.remove(); resolve(); return }
        const to = target.getBoundingClientRect()
        endX = to.left + to.width / 2
        endY = to.top + to.height / 2
      }
      frameCount++

      // Eased out (quick start, gentle landing), bending through a small, mostly-forward
      // bulge — enough to read as a toss with some weight, never enough to look like it
      // darts sideways before correcting back on course.
      const eased = 1 - (1 - t) * (1 - t)
      const dx = endX - startX
      const dy = endY - startY
      const dist = Math.hypot(dx, dy) || 1
      const perpX = -dy / dist
      const perpY = dx / dist
      const bulge = Math.min(12, dist * 0.07) * Math.sin(eased * Math.PI)
      const oneMinusT = 1 - eased
      const px = oneMinusT * oneMinusT * startX + 2 * oneMinusT * eased * (startX + dx * 0.5 + perpX * bulge) + eased * eased * endX
      const py = oneMinusT * oneMinusT * startY + 2 * oneMinusT * eased * (startY + dy * 0.5 + perpY * bulge) + eased * eased * endY

      const scale = t < 0.88 ? 1 : 1 + ((t - 0.88) / 0.12) * 0.25
      // translate3d keeps the ball on its own compositor layer for the whole flight.
      ball.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) scale(${scale})`

      if (t < 1) {
        requestAnimationFrame(frame)
        return
      }

      const target = findBankTarget()
      if (target) {
        target.classList.add('minute-bank-pulse')
        window.setTimeout(() => target.classList.remove('minute-bank-pulse'), 350)
      }
      resolve()

      // Fade/shrink the icon away in place — set up as a genuine CSS transition (not a
      // per-frame rAF write) since there's nothing left to track once it's landed.
      requestAnimationFrame(() => {
        ball.style.transition = 'transform 0.28s ease, opacity 0.28s ease'
        ball.style.transform = `translate3d(${endX}px, ${endY}px, 0) translate(-50%, -50%) scale(0.2)`
        ball.style.opacity = '0'
        window.setTimeout(() => ball.remove(), 300)
      })
    }

    requestAnimationFrame(frame)
  })
}

const COLLECT_MS = 260

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
