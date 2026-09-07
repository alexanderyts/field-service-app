import { type MutableRefObject } from 'react'

// Drive a single rAF loop that grows/shrinks `el`'s height AND the page scroll together, so the
// Service Schedule card expands/minimizes in one continuous motion (the card pinning under the
// header) instead of an instant snap + a separate jump. `mountedRef` guards the deferred frames
// against a mid-animation unmount (tab switch). easeInOutCubic for a soft start and stop.
export function animateHeightScroll(
  el: HTMLElement,
  fromH: number,
  toH: number,
  fromScroll: number | null,
  toScroll: number,
  onDone: () => void,
  mountedRef: MutableRefObject<boolean>,
  activeRef: MutableRefObject<number>,
  token: number,
  holdHeight = false,
) {
  const DUR = 420
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  el.style.overflow = 'hidden'
  function frame(now: number) {
    // A newer expand/minimize superseded this one (e.g. Minimize tapped mid-expand) — bail so the
    // two loops don't fight over the frame height; the newer one owns it now.
    if (activeRef.current !== token) return
    const e = Math.min(1, (now - t0) / DUR)
    const k = ease(e)
    el.style.height = `${fromH + (toH - fromH) * k}px`
    if (fromScroll != null) window.scrollTo(0, fromScroll + (toScroll - fromScroll) * k)
    if (e < 1 && mountedRef.current) {
      requestAnimationFrame(frame)
    } else {
      // On minimize we keep the frame pinned at `toH` (overflow clipped) and let onDone swap in
      // the collapsed content first — releasing to auto here would briefly re-expand to the (still
      // mounted, transform-folded but full-layout-height) week content and cause a visible shake.
      if (!holdHeight) {
        el.style.height = ''
        el.style.overflow = ''
      } else {
        el.style.height = `${toH}px`
      }
      onDone()
    }
  }
  requestAnimationFrame(frame)
}
