import type { ReactNode } from 'react'
import type { ShareRef } from '../db'

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
