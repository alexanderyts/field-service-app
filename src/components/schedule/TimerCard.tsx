import { useEffect, useState } from 'react'
import { CATEGORY_LABELS } from '../../categories'
import { creditHoursEnabled } from '../../settings'
import { elapsedMs, fmtElapsed, isRunning, isStopped, loadTimer, markStopped, pauseTimer, resumeTimer, saveTimer, startTimer, stopTimer, type TimerState } from '../../timer'
import type { TimeCategory } from '../../db'
import ConfirmDialog from '../ConfirmDialog'

export interface TimerStopResult { hours: number; minutes: number; category: TimeCategory; activityNote: string; startedAt: number; endedAt: number }

/**
 * Start / pause / stop for the live timer. Every change is written to localStorage before
 * it is shown, so a killed app resumes exactly where it was. The display ticks once a second
 * but is always recomputed from timestamps, so a throttled background tab shows the true
 * elapsed time the moment it comes back.
 *
 * Stop does not clear the record: it waits, stopped, until the parent has written the log
 * (it then remounts this card) or the person discards it (F050).
 */
export function TimerCard({
  onStop,
}: {
  onStop: (result: TimerStopResult, originEl?: HTMLElement) => void
}) {
  const [timer, setTimer] = useState<TimerState | null>(() => loadTimer())
  const [now, setNow] = useState(() => Date.now())
  const [confirmDiscard, setConfirmDiscard] = useState(false)

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

  function openLog(t: TimerState, el: HTMLElement) {
    const r = stopTimer(t, t.stoppedAt ?? Date.now())
    onStop(
      { hours: Math.floor(r.minutes / 60), minutes: r.minutes % 60, category: t.category, activityNote: t.activityNote, startedAt: r.startedAt, endedAt: r.endedAt },
      el
    )
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

  const stopped = isStopped(timer)
  const running = isRunning(timer)
  const elapsed = elapsedMs(timer, now)
  const cats: TimeCategory[] = creditHoursEnabled() ? ['ministry', 'credit'] : ['ministry']

  return (
    <div className={`timer-card${running ? ' running' : ' paused'}`} role="group" aria-label="Service timer">
      <div className="timer-top">
        <span className="timer-elapsed" aria-live="off">{fmtElapsed(elapsed)}</span>
        <span className="timer-state muted">{stopped ? 'Stopped · not logged yet' : running ? 'Counting' : 'Paused'}</span>
      </div>
      {cats.length > 1 && !stopped && (
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
        {stopped ? (
          <>
            <button className="secondary" onClick={() => setConfirmDiscard(true)}>Discard</button>
            <button onClick={(e) => openLog(timer, e.currentTarget)}>Log it</button>
          </>
        ) : (
          <>
            {running ? (
              <button className="secondary" onClick={() => update(pauseTimer(timer, Date.now()))}>⏸ Pause</button>
            ) : (
              <button className="secondary" onClick={() => update(resumeTimer(timer, Date.now()))}>▶ Resume</button>
            )}
            <button
              onClick={(e) => {
                // Saved stopped BEFORE the form opens: a second tap, a closed form or a killed
                // app all find the same frozen time still waiting to be logged.
                const next = markStopped(timer, Date.now())
                update(next)
                openLog(next, e.currentTarget)
              }}
            >
              ■ Stop &amp; log
            </button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this time?"
        message={`${fmtElapsed(elapsed)} will not be logged.`}
        confirmLabel="Discard"
        tone="danger"
        onConfirm={() => { setConfirmDiscard(false); update(null) }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
