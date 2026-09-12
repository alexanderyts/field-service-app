import { useRef, useState } from 'react'
import type { TimeCategory } from '../../db'
import { CATEGORY_LABELS, CREDIT_ACTIVITY_SUGGESTIONS } from '../../categories'
import { creditHoursEnabled } from '../../settings'
import { NumPad } from './NumPad'

/** One-tap presets. Tapping one fills the hours/minutes fields; the NumPad stays for anything else. */
const PRESETS: { label: string; h: number; m: number }[] = [
  { label: '30m', h: 0, m: 30 },
  { label: '1h', h: 1, m: 0 },
  { label: '1h 30m', h: 1, m: 30 },
  { label: '2h', h: 2, m: 0 },
  { label: '3h', h: 3, m: 0 },
]

/**
 * The time-entry form: hours/minutes (presets or NumPad), category pills, Activity Note,
 * Submit. Extracted from DayActionModal (tracking-first Wave 3) so the day modal and the
 * tab's primary "Log time" button share one form and one banking path. `onSubmit` is the
 * hub's `quickLogTime`, which owns the minute-bank rule (AUDIT F-A6, F011).
 */
export function LogTimeForm({
  closing,
  onSubmit,
}: {
  /** True while the hub is animating the minutes into the bank — fades the other fields. */
  closing: boolean
  onSubmit: (hours: number, minutes: number, category: TimeCategory, activityNote: string, minutesEl?: HTMLElement) => void
}) {
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [category, setCategory] = useState<TimeCategory>('ministry')
  const [activityNote, setActivityNote] = useState('')
  // One-way: every path out of Submit ends with the host unmounting this form, so a second
  // tap during the ~620ms collect animation must not write a second entry (REVIEW.md F-C2).
  const [submitted, setSubmitted] = useState(false)
  const [numPad, setNumPad] = useState<'hours' | 'minutes' | null>(null)
  const minutesBtnRef = useRef<HTMLButtonElement>(null)

  // Credit off means Ministry only (see the 0.20.0 notes on the old 'other' category).
  const availableCats: TimeCategory[] = creditHoursEnabled() ? ['ministry', 'credit'] : ['ministry']
  const effectiveCategory = availableCats.includes(category) ? category : 'ministry'
  const isPreset = (p: { h: number; m: number }) => Number(hours) === p.h && Number(minutes) === p.m

  return (
    <div className={closing ? 'time-entry-closing' : ''}>
      <div className="field">
        <span className="field-label">How long?</span>
        <div className="cat-pills">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`chip${isPreset(p) ? ' active' : ''}`}
              aria-pressed={isPreset(p)}
              onClick={() => { setHours(String(p.h)); setMinutes(String(p.m)) }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hours-minutes-row">
        <div className="field">
          <span className="field-label">Hours</span>
          <button className="numpad-display-btn" onClick={() => setNumPad('hours')}>{hours}</button>
        </div>
        <div className="field">
          <span className="field-label">Minutes</span>
          <button ref={minutesBtnRef} className="numpad-display-btn" onClick={() => setNumPad('minutes')}>{minutes}</button>
        </div>
      </div>
      {availableCats.length > 1 && (
        <div className="field">
          <span className="field-label">Category</span>
          <div className="cat-pills">
            {availableCats.map((cat) => (
              <button
                key={cat}
                className={`chip${effectiveCategory === cat ? ' active' : ''}`}
                aria-pressed={effectiveCategory === cat}
                onClick={() => setCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* The Activity Note annotates the log and nothing else: no total, no cap, no goal. */}
      <div className="field">
        <span className="field-label">What was it? (optional)</span>
        {effectiveCategory === 'credit' && (
          <div className="cat-pills">
            {CREDIT_ACTIVITY_SUGGESTIONS.map((s) => (
              <button
                key={s}
                className={`chip${activityNote === s ? ' active' : ''}`}
                aria-pressed={activityNote === s}
                onClick={() => setActivityNote(activityNote === s ? '' : s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <input
          value={activityNote}
          onChange={(e) => setActivityNote(e.target.value)}
          aria-label="What this time was (optional)"
          placeholder={effectiveCategory === 'credit' ? 'e.g. LDC, Circuit assembly…' : 'e.g. Cart witnessing, Letter writing…'}
        />
      </div>
      <button
        onClick={() => {
          if (submitted) return
          setSubmitted(true)
          onSubmit(Math.max(0, Number(hours) || 0), Math.min(59, Math.max(0, Number(minutes) || 0)), effectiveCategory, activityNote, minutesBtnRef.current ?? undefined)
        }}
        disabled={(Number(hours) === 0 && Number(minutes) === 0) || submitted || closing}
      >
        Submit Time
      </button>

      {numPad === 'hours' && (
        <NumPad initialValue={hours} label="Hours" onConfirm={setHours} onClose={() => setNumPad(null)} />
      )}
      {numPad === 'minutes' && (
        <NumPad initialValue={minutes} label="Minutes" max={59} onConfirm={setMinutes} onClose={() => setNumPad(null)} />
      )}
    </div>
  )
}
