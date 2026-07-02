/** Fires a small flying "ball" from wherever time was just banked (the Save button that
    was tapped) up to the minute-bank pill in the Schedule header — a quick, playful visual
    cue for where banked minutes go. Ball is appended straight to document.body (not through
    React) so it keeps flying and fading even after the modal that started it closes. Purely
    cosmetic; no-ops safely if either element isn't on screen (different tab, tiny viewport). */
export function flyToMinuteBank(originEl: HTMLElement | null | undefined) {
  if (!originEl) return
  // Prefer the pill itself (precise target once it exists); fall back to its wrapper for
  // the very first minute ever banked, when the pill hasn't rendered yet.
  const target = (document.querySelector('.minute-bank-pill') ??
    document.querySelector('[data-minute-bank-target]')) as HTMLElement | null
  if (!target) return

  const from = originEl.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const fromX = from.left + from.width / 2
  const fromY = from.top + from.height / 2
  const toX = to.left + to.width / 2
  const toY = to.top + to.height / 2

  const ball = document.createElement('div')
  ball.className = 'minute-bank-ball'
  ball.textContent = '⏱'
  ball.style.left = `${fromX}px`
  ball.style.top = `${fromY}px`
  ball.style.setProperty('--dx', `${toX - fromX}px`)
  ball.style.setProperty('--dy', `${toY - fromY}px`)
  document.body.appendChild(ball)

  const FLIGHT_MS = 700
  window.setTimeout(() => {
    target.classList.add('minute-bank-pulse')
    window.setTimeout(() => target.classList.remove('minute-bank-pulse'), 400)
  }, FLIGHT_MS - 150)

  ball.addEventListener('animationend', () => ball.remove())
}
