import { useEffect, useState } from 'react'
import { CATEGORY_LABELS } from '../../categories'
import { creditHoursEnabled } from '../../settings'
import { elapsedMs, fmtElapsed, isRunning, loadTimer, pauseTimer, resumeTimer, saveTimer, startTimer, stopTimer, type TimerState } from '../../timer'
import type { TimeCategory } from '../../db'

/**
 * Start / pause / stop for the live timer. Every change is written to localStorage before
 * it is shown, so a killed app resumes exactly where it was. The display ticks once a second
 * but is always recomputed from timestamps, so a throttled background tab shows the true
 * elapsed time the moment it comes back.
 */
export function TimerCard({
  onStop,
}: {
  onStop: (result: { hours: number; minutes: number; category: TimeCategory; activityNote: string; startedAt: number; endedAt: number }, originEl?: HTMLElement) => void
}) {
  const [timer, setTimer] = useState<TimerState | null>(() => loadTimer())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!timer || !isRunning(timer)) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [timer])

  function update(next: TimerState | null) {
    saveTimer(next)
    setTimer(next)
    setNow(Date.now())
  }

  if (!timer) {
    return (
      <div className="timer-card idle">
        <button className="secondary timer-start" onClick={() => update(startTimer(Date.now()))}>
          ▶ Start timer
        </button>
        <span className="muted timer-hint">Heading out? Start it and stop when you're done.</span>
      </div>
    )
  }

  const running = isRunning(timer)
  const elapsed = elapsedMs(timer, now)
  const cats: TimeCategory[] = creditHoursEnabled() ? ['ministry', 'credit'] : ['ministry']

  return (
    <div className={`timer-card${running ? ' running' : ' paused'}`} role="group" aria-label="Service timer">
      <div className="timer-top">
        <span className="timer-elapsed" aria-live="off">{fmtElapsed(elapsed)}</span>
        <span className="timer-state muted">{running ? 'Counting' : 'Paused'}</span>
      </div>
      {cats.length > 1 && (
        <div className="cat-pills timer-cats">
          {cats.map((c) => (
            <button
              key={c}
              className={`chip${timer.category === c ? ' active' : ''}`}
              aria-pressed={timer.category === c}
              onClick={() => update({ ...timer, category: c })}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      <div className="row timer-actions">
        {running ? (
          <button className="secondary" onClick={() => update(pauseTimer(timer, Date.now()))}>⏸ Pause</button>
        ) : (
          <button className="secondary" onClick={() => update(resumeTimer(timer, Date.now()))}>▶ Resume</button>
        )}
        <button
          onClick={(e) => {
            const endedAt = Date.now()
            const r = stopTimer(timer, endedAt)
            // Clear first (F011 order): the stop is durable before the form opens, and a
            // second tap can't stop the same timer twice.
            update(null)
            onStop(
              { hours: Math.floor(r.minutes / 60), minutes: r.minutes % 60, category: timer.category, activityNote: timer.activityNote, startedAt: r.startedAt, endedAt: r.endedAt },
              e.currentTarget
            )
          }}
        >
          ■ Stop &amp; log
        </button>
      </div>
    </div>
  )
}
