import { useState } from 'react'
import { localDateAfter } from '../../localDate'

const QUICK: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
]

/**
 * Return-visit date as one tap at the door: Tomorrow / +1 week / +2 weeks, or Pick… for any
 * date, plus the time. Shared by the visit form and the return-visit editor so both read the
 * same way. `date` is `YYYY-MM-DD` ('' = no return visit, when `allowNone`).
 */
export function VisitDateChips({
  date,
  time,
  onDate,
  onTime,
  allowNone = false,
}: {
  date: string
  time: string
  onDate: (date: string) => void
  onTime: (time: string) => void
  allowNone?: boolean
}) {
  const now = Date.now()
  const quickMatch = QUICK.find((q) => localDateAfter(q.days, now) === date)
  const [picking, setPicking] = useState(() => !!date && !quickMatch)

  return (
    <div className="visit-date-chips">
      <div className="cat-pills" role="group" aria-label="Return visit date">
        {allowNone && (
          <button type="button" className={`chip${!date && !picking ? ' active' : ''}`} aria-pressed={!date && !picking} onClick={() => { setPicking(false); onDate('') }}>
            None
          </button>
        )}
        {QUICK.map((q) => {
          const active = !picking && quickMatch === q
          return (
            <button key={q.days} type="button" className={`chip${active ? ' active' : ''}`} aria-pressed={active} onClick={() => { setPicking(false); onDate(localDateAfter(q.days, now)) }}>
              {q.label}
            </button>
          )
        })}
        <button type="button" className={`chip${picking ? ' active' : ''}`} aria-pressed={picking} onClick={() => setPicking(true)}>
          Pick…
        </button>
      </div>
      {(date || picking) && (
        <div className="field-row">
          {picking && (
            <label className="field">
              <span className="field-label">Date</span>
              <input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span className="field-label">Time</span>
            <input type="time" value={time} onChange={(e) => onTime(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  )
}
