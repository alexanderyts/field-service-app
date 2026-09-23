import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TimeCategory } from '../db'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from '../categories'
import {
  CREDIT_CAP_HOURS,
  displayGoalMin,
  effectiveMonthlyGoalMin,
  fmtDuration,
  monthTotals,
  serviceYearBounds,
  serviceYearLabel,
  serviceYearRangeLabel,
  serviceYearlyApplied,
  serviceYearlyTotals,
} from '../timeStats'
import { getAuxConfig } from '../auxPioneering'
import { getMinuteBank, getParticipatedMonth, getReportedAt, setParticipatedMonth, setReported } from '../settings'
import { deriveRole, roleReportsHours, roleTracksHours } from '../schedulePrefsRole'
import { buildMonthReport, dueReportMonth, hasSomethingToReport, reportText } from '../monthReport'
import ServiceYearReview from './ServiceYearReview'
import { StepperNav } from './SharedBits'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function encouragement(pct: number, totalMin: number): string {
  if (totalMin === 0) return "No time logged yet this month — every hour starts somewhere. You've got this! 💪"
  if (pct >= 100) return "Goal reached! What an incredible month — your hard work really shows. 🏆"
  if (pct >= 75) return "Almost there! You're in the home stretch — finish strong. 🌟"
  if (pct >= 50) return "Great progress! You're well past halfway — keep that momentum going. 🙌"
  if (pct >= 25) return "Good start! You're building momentum and making a real difference. 😊"
  return "Every hour counts. Keep going — you're doing something meaningful. ❤️"
}

export default function Reports() {
  const now = new Date()
  // Days 1–10: open on last month while its report is still to hand in (Phase 2 of
  // docs/review-2026-09-23.md). Automatic until the person navigates or marks it; after that
  // their choice holds, so marking a report submitted doesn't yank the view to another month.
  const [chosenOffset, setChosenOffset] = useState<number | null>(null)
  // Participation and "submitted" live in localStorage; bumping this re-reads them.
  const [, setMarksVersion] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  const logs = useLiveQuery(() => db.timeLogs.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const prefs = useLiveQuery(() => db.schedulePrefs.toArray(), [])
  const territoryCompletions = useLiveQuery(() => db.territoryCompletions.toArray(), []) ?? []

  const due = dueReportMonth(
    now,
    (y, m) => getReportedAt(y, m) != null,
    (y, m) => hasSomethingToReport(buildMonthReport({ logs, calls, people, showHours: false, ticked: getParticipatedMonth(y, m), year: y, month: m })),
  )
  const monthOffset = chosenOffset ?? (due ? -1 : 0)
  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const targetYear = targetDate.getFullYear()
  const targetMonth = targetDate.getMonth()

  function inMonth(ts: number) {
    const d = new Date(ts)
    return d.getFullYear() === targetYear && d.getMonth() === targetMonth
  }

  const monthLogs = logs.filter((l) => inMonth(l.date))
  const monthCalls = calls.filter((c) => inMonth(c.date))
  const monthAppts = appointments.filter((a) => inMonth(a.date))
  const newContacts = people.filter((p) => inMonth(p.createdAt))

  const { total: totalMin, creditUsed, applied: appliedMin } = monthTotals(monthLogs)

  // By category
  const byCat = new Map<TimeCategory, number>()
  for (const l of monthLogs) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.minutes)
  const catEntries = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])

  // Longest single day — keyed by a locale-independent Y-M-D string (not a round trip
  // through toLocaleDateString/Date-parsing, which is ambiguous for non-US locales).
  const byDay = new Map<string, number>()
  for (const l of monthLogs) {
    const d = new Date(l.date)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    byDay.set(key, (byDay.get(key) ?? 0) + l.minutes)
  }
  let longestDay: { label: string; min: number } | null = null
  for (const [key, min] of byDay) {
    if (!longestDay || min > longestDay.min) {
      const [y, m, day] = key.split('-').map(Number)
      const d = new Date(y, m, day)
      longestDay = {
        label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        min,
      }
    }
  }

  // Most active day of week
  const byDow = new Array(7).fill(0)
  for (const [key, min] of byDay) {
    const [y, m, day] = key.split('-').map(Number)
    byDow[new Date(y, m, day).getDay()] += min
  }
  const maxDow = byDow.indexOf(Math.max(...byDow))
  const mostActiveDay = byDow[maxDow] > 0 ? DAY_NAMES[maxDow] : null

  // Call stats
  const notHomeCalls = monthCalls.filter((c) => c.notHome).length
  const atHomeCalls = monthCalls.filter((c) => !c.notHome).length
  const scripturesShared = monthCalls.filter((c) => c.scriptures?.trim()).length
  const returnVisits = monthAppts.length

  // Service year (Sept–Aug), not the calendar year
  const reportServiceYear = serviceYearLabel(targetDate)
  // Named, newest first — a bare count is unverifiable, and this figure gets copied onto a
  // real report, so it has to be possible to see what was counted.
  const monthCompletions = territoryCompletions
    .filter((t) => inMonth(t.completedAt))
    .sort((a, b) => b.completedAt - a.completedAt)
  const monthTerritoriesCompleted = monthCompletions.length
  const yearTerritoriesCompleted = territoryCompletions.filter(
    (t) => serviceYearLabel(new Date(t.completedAt)) === reportServiceYear
  ).length
  const yearAppliedMin = serviceYearlyApplied(logs, reportServiceYear)
  const yearStats = serviceYearlyTotals(logs, reportServiceYear)
  const yearGoalMin = (prefs?.[0]?.yearlyHours ?? 0) * 60
  // Same rounding as the Service tab, so the two screens agree on the month's goal (F048).
  const monthGoalMin = displayGoalMin(effectiveMonthlyGoalMin(
    { isPioneer: prefs?.[0]?.isPioneer, weeklyHours: prefs?.[0]?.weeklyHours ?? 0, goalPeriod: prefs?.[0]?.goalPeriod, monthlyHours: prefs?.[0]?.monthlyHours },
    getAuxConfig(),
    targetYear,
    targetMonth,
  ))
  const monthPct = monthGoalMin > 0 ? Math.min(100, Math.round((appliedMin / monthGoalMin) * 100)) : 0
  const yearPct = yearGoalMin > 0 ? Math.min(100, Math.round((yearAppliedMin / yearGoalMin) * 100)) : 0
  // Raw (uncapped) progress bar length — the counted/applied fill above is always <= this.
  const yearRawPct = yearGoalMin > 0 ? Math.min(100, (yearStats.total / yearGoalMin) * 100) : 0
  const yearRemainingMin = Math.max(0, yearGoalMin - yearAppliedMin)

  // August is the close of the service year — once that year's Aug 31 has actually
  // passed, offer the special year-in-review popup on that month's report.
  const isAugustReport = targetMonth === 7
  const serviceYearComplete = Date.now() > serviceYearBounds(reportServiceYear).end
  const [showYearReview, setShowYearReview] = useState(false)

  const monthLabel = targetDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const isCurrentMonth = monthOffset === 0
  // Leftover ministry minutes not yet logged as an hour — they carry into next month, and the
  // person should see that the figure they submit doesn't include them.
  const bankedMin = getMinuteBank()
  const reportRole = deriveRole(prefs?.[0] ?? {}, getAuxConfig())
  const reportTracksHours = roleTracksHours(reportRole, prefs?.[0] ?? {}, getAuxConfig(), targetYear, targetMonth)
  const report = buildMonthReport({
    logs,
    calls,
    people,
    showHours: roleReportsHours(reportRole, getAuxConfig(), targetYear, targetMonth),
    ticked: getParticipatedMonth(targetYear, targetMonth),
    year: targetYear,
    month: targetMonth,
  })
  const reportedAt = getReportedAt(targetYear, targetMonth)
  const canHandOff = hasSomethingToReport(report)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  async function copy(key: string, value: string) {
    if (await copyText(value)) {
      setCopied(key)
      setShareMsg(null)
    } else setShareMsg("Couldn't copy on this device — press and hold the figure to copy it.")
  }

  // The OS share sheet reaches mail, messages, notes — whatever the person uses to hand the
  // report in — with no address to type. Copying is the fallback where sharing isn't offered.
  async function shareReport() {
    const text = reportText(report, monthLabel)
    if (navigator.share) {
      try {
        await navigator.share({ title: `Service report — ${monthLabel}`, text })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    await copy('all', text)
    setShareMsg('Report copied — paste it anywhere.')
  }

  function toggleParticipated(v: boolean) {
    setParticipatedMonth(targetYear, targetMonth, v)
    setMarksVersion((n) => n + 1)
  }
  function markSubmitted(v: boolean) {
    setReported(targetYear, targetMonth, v ? Date.now() : null)
    setChosenOffset(monthOffset)
    setMarksVersion((n) => n + 1)
  }

  const copyBtn = (key: string, value: string, label: string) => (
    <button className="secondary small report-copy" onClick={() => copy(key, value)} aria-label={`Copy ${label}`}>
      {copied === key ? 'Copied' : 'Copy'}
    </button>
  )

  return (
    <div className="view">
      {/* Month navigation — kept symmetric: arrow · centered title · arrow. The Re-run
          and "Back to this month" actions live in their own centered row below so the two
          arrows always share a baseline and mirror each other. */}
      <StepperNav
        className="report-nav"
        onPrev={() => setChosenOffset(monthOffset - 1)}
        onNext={() => setChosenOffset(monthOffset + 1)}
        nextDisabled={monthOffset >= 0}
      >
        <h2 className="applet-title" style={{ margin: 0, textAlign: 'center' }}>{monthLabel}</h2>
      </StepperNav>
      <div className="report-nav-actions">
        {!isCurrentMonth && (
          <button className="secondary small" onClick={() => setChosenOffset(0)}>Back to this month</button>
        )}
      </div>

      <div className="report-body">
      {/* The hand-off, in the order the congregation's form asks (CONTEXT.md › Reporting):
          one tap copies each figure for NW Publisher or the paper slip. Everything below this
          card is for the person's own records. */}
      <div className={`card highlight report-submit${reportedAt ? ' submitted' : ''}`}>
        <div className="report-submit-head">
          <h4 style={{ margin: 0 }}>{monthLabel} report</h4>
          {reportedAt && (
            <span className="report-submitted-chip">
              ✓ Submitted {new Date(reportedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        <ul className="report-submit-list">
          <li>
            <div className="report-field">
              <span>Shared in the ministry</span>
              {report.participationImplied ? (
                <span className="muted report-field-note">From your logged time and calls</span>
              ) : (
                <label className="report-field-note report-shared-toggle">
                  <input type="checkbox" checked={report.participated} onChange={(e) => toggleParticipated(e.target.checked)} />
                  Tap when you've shared this month
                </label>
              )}
            </div>
            <strong>{report.participated ? 'Yes' : 'No'}</strong>
            {copyBtn('shared', report.participated ? 'Yes' : 'No', 'shared in the ministry')}
          </li>
          <li>
            <div className="report-field">
              <span>Bible studies</span>
              {report.bibleStudyNames.length > 0 && (
                <span className="muted report-field-note">{report.bibleStudyNames.join(', ')}</span>
              )}
              {report.studiesNotVisited.length > 0 && (
                <span className="muted report-field-note">
                  Not counted: {report.studiesNotVisited.join(', ')} — no visit logged this month. Log one to count it.
                </span>
              )}
            </div>
            <strong>{report.bibleStudies}</strong>
            {copyBtn('studies', String(report.bibleStudies), 'Bible studies')}
          </li>
          {report.showHours && (
            <li>
              <div className="report-field">
                <span>Hours</span>
                {report.leftoverMin > 0 && (
                  <span className="muted report-field-note">
                    {isCurrentMonth ? `+${report.leftoverMin}m toward the next hour` : `+${report.leftoverMin}m not included — carry it into next month`}
                  </span>
                )}
                {isCurrentMonth && bankedMin > 0 && (
                  <span className="muted report-field-note">{bankedMin}m in the minute bank carry forward</span>
                )}
              </div>
              <strong>{report.hours}</strong>
              {copyBtn('hours', String(report.hours), 'hours')}
            </li>
          )}
          {report.comments && (
            <li>
              <div className="report-field">
                <span>Comments</span>
                <span className="muted report-field-note">{report.comments}</span>
              </div>
              <strong aria-hidden="true" />
              {copyBtn('comments', report.comments, 'comments')}
            </li>
          )}
        </ul>
        {!report.showHours && totalMin > 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Publishers report participation and Bible studies; the hours below are for you.</p>
        )}
        <div className="row report-submit-actions">
          <button onClick={shareReport} disabled={!canHandOff}>Share report</button>
          {reportedAt ? (
            <button className="secondary" onClick={() => markSubmitted(false)}>Undo submitted</button>
          ) : (
            <button className="secondary" onClick={() => markSubmitted(true)} disabled={!canHandOff}>Mark as submitted</button>
          )}
        </div>
        {shareMsg && <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{shareMsg}</p>}
      </div>

      {/* Encouragement banner — only where hours are being tracked toward something */}
      {reportTracksHours && (
        <div className="card report-encourage">
          <p>{encouragement(monthPct, totalMin)}</p>
        </div>
      )}

      {/* Hours summary */}
      <div className="card highlight">
        <div className="report-total-row">
          <div className="report-big-num">{fmtDuration(totalMin)}</div>
          <div className="report-total-label">
            <span>Total hours this month</span>
            {monthGoalMin > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                Goal: {fmtDuration(monthGoalMin)} · {monthPct}% reached
              </span>
            )}
            {isCurrentMonth && bankedMin > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                {bankedMin}m in the minute bank, carried forward
              </span>
            )}
          </div>
        </div>
        {monthGoalMin > 0 && (
          <div className="progress-bar" style={{ marginTop: 4 }}>
            <div className="progress-fill" style={{ width: `${monthPct}%` }} />
          </div>
        )}

        {catEntries.length > 0 && (
          <div className="report-cats">
            {catEntries.map(([cat, min]) => (
              <div key={cat} className="report-cat-chip">
                <span>{CATEGORY_EMOJI[cat]}</span>
                <span>{CATEGORY_LABELS[cat]}</span>
                <strong>{fmtDuration(min)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity highlights */}
      {(longestDay || returnVisits > 0 || newContacts.length > 0 || scripturesShared > 0 || notHomeCalls > 0) && (
        <div className="card">
          <h4 style={{ marginBottom: 8 }}>Highlights</h4>
          <div className="report-highlights">
            {longestDay && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">🏆</span>
                <div>
                  <strong>Longest day</strong>
                  <p className="muted">{longestDay.label} — {fmtDuration(longestDay.min)}</p>
                </div>
              </div>
            )}
            {mostActiveDay && byDay.size > 1 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">📅</span>
                <div>
                  <strong>Most active day</strong>
                  <p className="muted">{mostActiveDay}s were your busiest this month</p>
                </div>
              </div>
            )}
            {returnVisits > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">🔄</span>
                <div>
                  <strong>{returnVisits} return visit{returnVisits !== 1 ? 's' : ''} scheduled</strong>
                  <p className="muted">People who wanted to hear more — great work!</p>
                </div>
              </div>
            )}
            {newContacts.length > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">👋</span>
                <div>
                  <strong>{newContacts.length} new contact{newContacts.length !== 1 ? 's' : ''} added</strong>
                  <p className="muted">{newContacts.map((p) => p.name).join(', ')}</p>
                </div>
              </div>
            )}
            {atHomeCalls > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">🗣️</span>
                <div>
                  <strong>{atHomeCalls} conversation{atHomeCalls !== 1 ? 's' : ''} logged</strong>
                  <p className="muted">Every door opened is a door that mattered</p>
                </div>
              </div>
            )}
            {scripturesShared > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">📖</span>
                <div>
                  <strong>{scripturesShared} scripture{scripturesShared !== 1 ? 's' : ''} shared</strong>
                  <p className="muted">Planting seeds that last</p>
                </div>
              </div>
            )}
            {notHomeCalls > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon" aria-hidden="true">🚪</span>
                <div>
                  <strong>{notHomeCalls} home{notHomeCalls !== 1 ? 's' : ''} called on</strong>
                  <p className="muted">No one was in — every call still counts</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Temporary territories completed — independent of any hours goal, so it's its
          own card rather than folded into the (goal-gated) yearly progress card below. */}
      {(monthTerritoriesCompleted > 0 || yearTerritoriesCompleted > 0) && (
        <div className="card">
          <h4 style={{ marginBottom: 8 }}>Custom Territories</h4>
          <p>🗺️ {monthTerritoriesCompleted} completed this month</p>
          {monthCompletions.length > 0 && (
            <ul className="report-territory-list">
              {monthCompletions.map((t) => (
                <li key={t.id}>
                  <span className="report-territory-name">{t.name}</span>
                  <span className="muted">
                    {new Date(t.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' · '}
                    {t.streetCount} street{t.streetCount !== 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">{yearTerritoriesCompleted} completed this service year ({serviceYearRangeLabel(reportServiceYear)})</p>
        </div>
      )}

      {/* Credit hours note */}
      {creditUsed && (
        <div className="card">
          <h4>Credit Hours Applied</h4>
          <p style={{ fontSize: 14 }}>
            You used credit hours this month. Up to <strong>{CREDIT_CAP_HOURS}h</strong> count toward your goal.
            <br />
            Hours applied: <strong>{fmtDuration(appliedMin)}</strong>
            {totalMin > CREDIT_CAP_HOURS * 60 && (
              <span className="muted"> ({fmtDuration(totalMin - appliedMin)} over the cap)</span>
            )}
          </p>
        </div>
      )}

      {/* Yearly progress */}
      {yearGoalMin > 0 && (
        <div className="card">
          <h4>Service year {serviceYearRangeLabel(reportServiceYear)}</h4>
          <div className="progress-bar">
            <div className="progress-fill raw" style={{ width: `${yearRawPct}%` }} />
            <div className="progress-fill" style={{ width: `${yearPct}%` }} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {fmtDuration(yearAppliedMin)} of {fmtDuration(yearGoalMin)} counted — {yearPct}% complete
          </p>
          {yearStats.total > yearAppliedMin && (
            <p className="muted" style={{ fontSize: 13 }}>
              {fmtDuration(yearStats.total)} logged in total this service year (55h/mo credit cap applies)
            </p>
          )}
          <p className="goal-remaining">
            {yearRemainingMin > 0
              ? `${fmtDuration(yearRemainingMin)} left to reach your yearly goal`
              : '🎉 Yearly goal reached!'}
          </p>
          {isAugustReport && serviceYearComplete && (
            <button className="secondary" style={{ marginTop: 10 }} onClick={() => setShowYearReview(true)}>
              📖 Review My Service Year
            </button>
          )}
        </div>
      )}

      </div>

      {showYearReview && (
        <ServiceYearReview
          label={reportServiceYear}
          logs={logs}
          calls={calls}
          people={people}
          appointments={appointments}
          prefs={prefs?.[0]}
          onClose={() => setShowYearReview(false)}
        />
      )}
    </div>
  )
}

/** Clipboard write with the old select-and-copy path as a fallback: the async Clipboard API is
    refused in some embedded browsers and older WebViews, and one refused Copy on report day is
    exactly when it matters. */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
