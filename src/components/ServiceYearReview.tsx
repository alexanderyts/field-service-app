import { useEffect, useState } from 'react'
import type { Appointment, Call, Person, SchedulePrefs, TimeCategory, TimeLog } from '../db'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from '../categories'
import { fmtDuration, serviceYearBounds, serviceYearRangeLabel, serviceYearlyApplied, serviceYearlyTotals } from '../timeStats'
import ModalPortal from '../ModalPortal'

/** Animates 0 -> target with an ease-out curve, once `start` flips true. */
function useCountUp(target: number, durationMs: number, start: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    let raf = 0
    const t0 = performance.now()
    function tick(t: number) {
      const p = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, start])
  return value
}

export default function ServiceYearReview({
  label,
  logs,
  calls,
  people,
  appointments,
  prefs,
  onClose,
}: {
  label: number
  logs: TimeLog[]
  calls: Call[]
  people: Person[]
  appointments: Appointment[]
  prefs?: SchedulePrefs
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'compiling' | 'reveal'>('compiling')

  useEffect(() => {
    const t = window.setTimeout(() => setPhase('reveal'), 1600)
    return () => window.clearTimeout(t)
  }, [])

  const { start, end } = serviceYearBounds(label)
  const inYear = (ts: number) => ts >= start && ts <= end

  const yearLogs = logs.filter((l) => inYear(l.date))
  const stats = serviceYearlyTotals(logs, label)
  const applied = serviceYearlyApplied(logs, label)
  const goalMin = (prefs?.yearlyHours ?? 0) * 60
  const pct = goalMin > 0 ? Math.min(100, Math.round((applied / goalMin) * 100)) : 0

  const byCat = new Map<TimeCategory, number>()
  for (const l of yearLogs) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.minutes)
  const catEntries = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])

  // Best month by raw minutes logged
  const byMonth = new Map<string, number>()
  for (const l of yearLogs) {
    const key = new Date(l.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    byMonth.set(key, (byMonth.get(key) ?? 0) + l.minutes)
  }
  let bestMonth: { label: string; min: number } | null = null
  for (const [key, min] of byMonth) {
    if (!bestMonth || min > bestMonth.min) bestMonth = { label: key, min }
  }

  const newContacts = people.filter((p) => inYear(p.createdAt))
  const newStudies = people.filter((p) => p.status === 'bible-study' && inYear(p.createdAt)).length
  const yearCalls = calls.filter((c) => inYear(c.date))
  const scripturesShared = yearCalls.filter((c) => c.scriptures?.trim()).length
  const returnVisitsScheduled = appointments.filter((a) => inYear(a.date)).length

  const countedHours = useCountUp(Math.round(applied / 60), 1800, phase === 'reveal')

  return (
    <ModalPortal>
    <div className="modal-backdrop year-review-backdrop" onClick={onClose}>
      <div className="modal year-review-modal" onClick={(e) => e.stopPropagation()}>
        <button className="year-review-close" onClick={onClose} aria-label="Close">×</button>

        {phase === 'compiling' ? (
          <div className="year-review-compiling">
            <div className="year-review-icon">📖</div>
            <h3>Compiling your {serviceYearRangeLabel(label)} service year…</h3>
          </div>
        ) : (
          <div className="year-review-body">
            <div className="year-review-slide" style={{ animationDelay: '0ms' }}>
              <p className="year-review-eyebrow">Your Service Year</p>
              <h2>{serviceYearRangeLabel(label)}</h2>
            </div>

            <div className="year-review-slide year-review-hero" style={{ animationDelay: '500ms' }}>
              <div className="year-review-big-num">{countedHours}h</div>
              <p>counted toward your goal</p>
              {goalMin > 0 && (
                <>
                  <div className="progress-bar" style={{ marginTop: 10 }}>
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>
                    {pct >= 100 ? '🎉 Goal reached!' : `${pct}% of your ${fmtDuration(goalMin)} goal`}
                  </p>
                </>
              )}
            </div>

            {catEntries.length > 0 && (
              <div className="year-review-slide" style={{ animationDelay: '1000ms' }}>
                <h4>How your time broke down</h4>
                <div className="report-cats">
                  {catEntries.map(([cat, min]) => (
                    <div key={cat} className="report-cat-chip">
                      <span>{CATEGORY_EMOJI[cat]}</span>
                      <span>{CATEGORY_LABELS[cat]}</span>
                      <strong>{fmtDuration(min)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="year-review-slide" style={{ animationDelay: '1500ms' }}>
              <h4>Highlights</h4>
              <div className="report-highlights">
                {bestMonth && (
                  <div className="report-highlight-item">
                    <span className="report-highlight-icon">🏆</span>
                    <div>
                      <strong>Best month</strong>
                      <p className="muted">{bestMonth.label} — {fmtDuration(bestMonth.min)}</p>
                    </div>
                  </div>
                )}
                {newContacts.length > 0 && (
                  <div className="report-highlight-item">
                    <span className="report-highlight-icon">👋</span>
                    <div>
                      <strong>{newContacts.length} new contact{newContacts.length !== 1 ? 's' : ''}</strong>
                      <p className="muted">People you met for the first time this year</p>
                    </div>
                  </div>
                )}
                {newStudies > 0 && (
                  <div className="report-highlight-item">
                    <span className="report-highlight-icon">📘</span>
                    <div>
                      <strong>{newStudies} Bible stud{newStudies !== 1 ? 'ies' : 'y'} started</strong>
                    </div>
                  </div>
                )}
                {returnVisitsScheduled > 0 && (
                  <div className="report-highlight-item">
                    <span className="report-highlight-icon">🔄</span>
                    <div>
                      <strong>{returnVisitsScheduled} return visit{returnVisitsScheduled !== 1 ? 's' : ''} scheduled</strong>
                    </div>
                  </div>
                )}
                {scripturesShared > 0 && (
                  <div className="report-highlight-item">
                    <span className="report-highlight-icon">📖</span>
                    <div>
                      <strong>{scripturesShared} scripture{scripturesShared !== 1 ? 's' : ''} shared</strong>
                    </div>
                  </div>
                )}
                {stats.total > applied && (
                  <div className="report-highlight-item">
                    <span className="report-highlight-icon">⏱️</span>
                    <div>
                      <strong>{fmtDuration(stats.total)} logged in total</strong>
                      <p className="muted">55h/mo credit cap applied where it counted toward your goal</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="year-review-slide year-review-closing" style={{ animationDelay: '2000ms' }}>
              <p>Another year of showing up, one door at a time. Well done. 🙏</p>
              <button onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}
