import { useEffect, useRef, useState } from 'react'

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | null>(null)

  function beginClose() {
    setVisible(false)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 200)
  }

  function toggle() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (open) { beginClose(); return }
    setOpen(true)
    // Mount first, then flip visible on the next frame so the fade-in transition runs.
    requestAnimationFrame(() => setVisible(true))
  }

  useEffect(() => {
    if (!open) return
    function onOutside(e: Event) {
      // A tap/press inside the tip (the icon or the bubble) shouldn't dismiss it; scroll
      // and resize always do, since the anchored bubble would otherwise drift off-target.
      if (e.type === 'pointerdown' && wrapRef.current?.contains(e.target as Node)) return
      beginClose()
    }
    document.addEventListener('pointerdown', onOutside, true)
    window.addEventListener('scroll', onOutside, true)
    window.addEventListener('resize', onOutside)
    return () => {
      document.removeEventListener('pointerdown', onOutside, true)
      window.removeEventListener('scroll', onOutside, true)
      window.removeEventListener('resize', onOutside)
    }
  }, [open])

  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])

  return (
    <span className="info-tip" ref={wrapRef}>
      <button type="button" className="info-tip-btn" onClick={toggle} aria-label="More info">
        ⓘ
      </button>
      {open && <span className={`info-tip-bubble${visible ? '' : ' closing'}`} role="tooltip">{text}</span>}
    </span>
  )
}

/** A goal bar whose denominator is always whole hours (goals round up to the nearest
    hour) — every completed hour is fully colored, and the one currently in progress
    shows only its actual fractional fill, staying dim until it completes. */
