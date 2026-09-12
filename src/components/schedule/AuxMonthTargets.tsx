import { auxMonthKey } from '../../auxPioneering'
import { currentYearMonths } from './dates'

/** The two chip rows an auxiliary pioneer uses to say which months are 15h and which are 30h.
    Shared by the intake (Survey) and the later-edit box (AuxPioneeringBox). */
export function AuxMonthTargets({
  months,
  monthTargets,
  onSet,
  onRemove,
}: {
  months: string[]
  monthTargets: Record<string, 15 | 30>
  onSet: (key: string, hours: 15 | 30) => void
  onRemove: (key: string) => void
}) {
  const row = (hours: 15 | 30) => (
    <div className="field" style={{ marginBottom: 10 }}>
      <span className="field-label">{hours} hours/month</span>
      <div className="day-toggle">
        {currentYearMonths().map(({ year, month, label }) => {
          const key = auxMonthKey(year, month)
          const active = months.includes(key) && monthTargets[key] === hours
          return (
            <button
              key={key}
              className={active ? 'chip active' : 'chip'}
              aria-pressed={active}
              onClick={() => (active ? onRemove(key) : onSet(key, hours))}
            >
              {label.slice(0, 3)}
            </button>
          )
        })}
      </div>
    </div>
  )
  return (
    <>
      <p className="muted" style={{ margin: '0 0 8px' }}>Tap each month into the target that applies to it.</p>
      {row(15)}
      {row(30)}
    </>
  )
}
