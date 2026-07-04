import type { ReactNode } from 'react'
import type { ShareRef } from '../db'
import type { RingSeg } from '../goalSegments'

/** The shared ‹ label › stepper used by the Service Schedule nav bar and the Reports month
    nav — one place for the prev/next arrow chrome so the two read consistently. Callers pass
    their own centered label (styled however that screen needs) and, optionally, a `trailing`
    slot that sits between the label and the › arrow (the Schedule bar puts its collapse ×
    there). `className` layers screen-specific treatment (e.g. `sched-nav`, `report-nav`). */
export function StepperNav({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  trailing,
  className,
  children,
}: {
  onPrev: () => void
  onNext: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  trailing?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`stepper-nav${className ? ' ' + className : ''}`}>
      <button className="icon-btn nav-arrow" onClick={onPrev} disabled={prevDisabled} title="Previous">‹</button>
      {children}
      {trailing}
      <button className="icon-btn nav-arrow" onClick={onNext} disabled={nextDisabled} title="Next">›</button>
    </div>
  )
}

/** The day goal ring: filled thick band for logged segments, hollow double-outlined band for
    scheduled ones, each arc's length its share of the weekly goal and accumulating around the
    circle. Drawn in a fixed 24-unit viewBox so all the geometry scales cleanly from `size`. The
    `.goal-ring` class positions it (absolutely centered) at the call site. */
export function GoalRing({ segments, size = 31, title }: { segments: RingSeg[]; size?: number; title?: string }) {
  const Rf = 9, Ro = 10.1, Ri = 7.9
  const Cf = 2 * Math.PI * Rf, Co = 2 * Math.PI * Ro, Ci = 2 * Math.PI * Ri
  const parts: ReactNode[] = []
  let off = 0
  segments.forEach((s, idx) => {
    const room = 1 - off
    if (room <= 0.001) return
    const p = Math.min(Math.max(s.frac, 0.02), room)
    if (s.logged) {
      parts.push(
        <circle key={idx} cx={12} cy={12} r={Rf} fill="none" stroke={s.color} strokeWidth={3.2}
          strokeDasharray={`${p * Cf} ${Cf - p * Cf}`} strokeDashoffset={-off * Cf} transform="rotate(-90 12 12)" />,
      )
    } else {
      parts.push(
        <circle key={`${idx}o`} cx={12} cy={12} r={Ro} fill="none" stroke={s.color} strokeWidth={1}
          strokeDasharray={`${p * Co} ${Co - p * Co}`} strokeDashoffset={-off * Co} transform="rotate(-90 12 12)" />,
        <circle key={`${idx}i`} cx={12} cy={12} r={Ri} fill="none" stroke={s.color} strokeWidth={1}
          strokeDasharray={`${p * Ci} ${Ci - p * Ci}`} strokeDashoffset={-off * Ci} transform="rotate(-90 12 12)" />,
      )
    }
    off += p
  })
  return (
    <svg className="goal-ring" width={size} height={size} viewBox="0 0 24 24" aria-hidden={!title}>
      {title && <title>{title}</title>}
      {parts}
    </svg>
  )
}

/** A small full ring for legends/keys — hollow double-outline (scheduled) or filled band
    (logged) — so the legend swatch looks like the day rings it explains. */
export function RingSwatch({ color, logged = false, size = 14 }: { color: string; logged?: boolean; size?: number }) {
  if (logged) {
    return (
      <svg className="ring-sw" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={3.4} />
      </svg>
    )
  }
  return (
    <svg className="ring-sw" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx={12} cy={12} r={10.2} fill="none" stroke={color} strokeWidth={1.2} />
      <circle cx={12} cy={12} r={7.8} fill="none" stroke={color} strokeWidth={1.2} />
    </svg>
  )
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A small tag marking a record that's been shared out (owner's copy) or received from
    someone (receiver's copy) — for list rows and detail headers. */
export function SharedBadge({ sharedWith, receivedFrom }: { sharedWith?: ShareRef[]; receivedFrom?: ShareRef }) {
  if (receivedFrom) {
    return <span className="badge share-badge" title={`Received ${fmtDate(receivedFrom.at)}`}>↙ From {receivedFrom.name}</span>
  }
  if (sharedWith && sharedWith.length > 0) {
    return <span className="badge share-badge" title={sharedWith.map((s) => `${s.name} · ${fmtDate(s.at)}`).join('\n')}>↗ Shared</span>
  }
  return null
}

/** Non-blocking banner shown at the top of an edit form for an item the user has shared,
    warning that edits here won't propagate to the copy they handed off. */
export function SharedWarning({ sharedWith }: { sharedWith?: ShareRef[] }) {
  if (!sharedWith || sharedWith.length === 0) return null
  const last = sharedWith[sharedWith.length - 1]
  const others = sharedWith.length - 1
  return (
    <div className="share-warning">
      ⚠ You shared this with <strong>{last.name}</strong> on {fmtDate(last.at)}
      {others > 0 ? ` (and ${others} other${others === 1 ? '' : 's'})` : ''}. Editing here won't update their copy.
    </div>
  )
}
