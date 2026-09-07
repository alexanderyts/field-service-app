import { MONTH_NAMES_LONG } from './dates'

/**
 * The non-pioneer equivalent of AddTime for anyone not tracking real hours — checking
 * the box off is the whole interaction, once a month, no hours or dates involved.
 */
export function MonthlyParticipationBox({
  month,
  participated,
  onChange,
}: {
  month: number
  participated: boolean
  onChange: (participated: boolean) => void
}) {
  // Non-pioneers who don't track hours just tick one box a month — so the whole card is that
  // single toggle (the checkbox sits where an expand button used to), with a warm confirmation
  // when it's checked instead of a bare box.
  return (
    <div className={`card participation-card${participated ? ' done' : ''}`}>
      <label className="participation-header">
        <div>
          <strong>Participation in the Ministry</strong>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            Did you share in the ministry during {MONTH_NAMES_LONG[month]}?
          </p>
        </div>
        <input
          type="checkbox"
          className="participation-check"
          checked={participated}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={`I participated in the ministry in ${MONTH_NAMES_LONG[month]}`}
        />
      </label>

      {participated && (
        <div className="participation-cue" role="status">
          <span className="participation-cue-emoji" aria-hidden="true">🎉</span>
          <div>
            <strong>You did it!</strong>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {MONTH_NAMES_LONG[month]} is marked as a month you shared in the ministry. Every visit makes a difference.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
