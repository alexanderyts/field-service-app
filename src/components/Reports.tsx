import { useEffect, useRef, useState } from 'react'
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
import { getMinuteBank, getParticipatedMonth } from '../settings'
import { deriveRole, roleTracksHours } from '../schedulePrefsRole'
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
  const [monthOffset, setMonthOffset] = useState(0)
  const [runKey, setRunKey] = useState(0)
  const [generating, setGenerating] = useState(false)
  const generateTimeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(generateTimeoutRef.current), [])

  // "Re-run" replays the staggered reveal. The report itself is always shown — the figures
  // the congregation asks for should never sit behind a button (tracking-first D7).
  function generateReport() {
    setGenerating(true)
    generateTimeoutRef.current = window.setTimeout(() => {
      setRunKey((k) => k + 1)
      setGenerating(false)
    }, 600)
  }

  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const targetYear = targetDate.getFullYear()
  const targetMonth = targetDate.getMonth()

  const logs = useLiveQuery(() => db.timeLogs.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const prefs = useLiveQuery(() => db.schedulePrefs.toArray(), [])
  const territoryCompletions = useLiveQuery(() => db.territoryCompletions.toArray(), []) ?? []

  const [email, setEmail] = useState('')

  function inMonth(ts: number) {
    const d = new Date(ts)
    return d.getFullYear() === targetYear && d.getMonth() === targetMonth
  }

  const monthLogs = logs.filter((l) => inMonth(l.date))
  const monthCalls = calls.filter((c) => inMonth(c.date))
  const monthAppts = appointments.filter((a) => inMonth(a.date))
  const newContacts = people.filter((p) => inMonth(p.createdAt))

  const { ministry: ministryMin, credit: creditMin, total: totalMin, creditUsed, applied: appliedMin } =
    monthTotals(monthLogs)

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
  // Participation is the month's checkbox, or implied by any logged time.
  const participated = getParticipatedMonth(targetYear, targetMonth) || totalMin > 0
  const bibleStudies = people.filter((p) => p.status === 'bible-study').length

  function reportBody(): string {
    let body = `Meleo Report — ${monthLabel}\n\n`
    body += `Shared in the ministry: ${participated ? 'Yes' : 'Not marked'}\n`
    body += `Bible studies: ${bibleStudies}\n`
    body += `Total Hours: ${fmtDuration(totalMin)}\n`
    if (isCurrentMonth && bankedMin > 0) body += `  (${bankedMin}m banked, carried forward)\n`
    if (ministryMin) body += `  Ministry: ${fmtDuration(ministryMin)}\n`
    if (creditMin) body += `  Credit Hours: ${fmtDuration(creditMin)}\n`
    // Deliberately no breakdown of credit by type. The congregation's Service Report has no
    // field for it — credit is submitted as a single figure regardless of what earned it, and
    // anything descriptive belongs in the report's remarks (see CONTEXT.md). The Activity Note
    // is for the person's own records, which is what the Reports tab itself shows.
    if (returnVisits) body += `\nReturn Visits Scheduled: ${returnVisits}\n`
    if (newContacts.length) body += `New Contacts Added: ${newContacts.length}\n`
    if (atHomeCalls) body += `Conversations: ${atHomeCalls}\n`
    if (notHomeCalls) body += `Not at Home: ${notHomeCalls}\n`
    if (scripturesShared) body += `Scriptures Shared: ${scripturesShared}\n`
    if (monthTerritoriesCompleted) {
      body += `Custom Territories Completed: ${monthTerritoriesCompleted} this month, ${yearTerritoriesCompleted} this service year\n`
      for (const t of monthCompletions) {
        body += `  ${t.name} — ${new Date(t.completedAt).toLocaleDateString()}\n`
      }
    }
    if (yearGoalMin) body += `\nYearly Goal Progress: ${fmtDuration(yearAppliedMin)} of ${fmtDuration(yearGoalMin)} (${yearPct}%)\n`
    return body
  }

  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportBody())
      setCopyMsg('Report copied — paste it anywhere.')
    } catch {
      setCopyMsg("Couldn't copy on this device — use Email instead.")
    }
  }

  // A `mailto:` link is a URL, and some mail apps cut it off around 2,000 characters — a big
  // month with a long list of completed territories can pass that and arrive truncated with
  // no warning (REVIEW.md F-C5). Past the limit the full text goes to the clipboard and the
  // email opens with a one-line note to paste it, which is never cut off.
  const MAILTO_SAFE_LEN = 1800
  async function emailReport() {
    const subject = `Meleo Report — ${monthLabel}`
    const body = reportBody()
    const full = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    if (full.length <= MAILTO_SAFE_LEN) {
      window.location.href = full
      return
    }
    try {
      await navigator.clipboard.writeText(body)
      setCopyMsg('This report is too long for a mail link, so it was copied — paste it into the email.')
      const note = 'This report was copied to your clipboard — paste it here.'
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(note)}`
    } catch {
      // No clipboard: send what fits rather than nothing, and say so.
      setCopyMsg('This report is too long for a mail link and copying failed — it may arrive cut off.')
      window.location.href = full
    }
  }

  return (
    <div className="view">
      {/* Month navigation — kept symmetric: arrow · centered title · arrow. The Re-run
          and "Back to this month" actions live in their own centered row below so the two
          arrows always share a baseline and mirror each other. */}
      <StepperNav
        className="report-nav"
        onPrev={() => setMonthOffset((o) => o - 1)}
        onNext={() => setMonthOffset((o) => o + 1)}
        nextDisabled={monthOffset >= 0}
      >
        <h2 className="applet-title" style={{ margin: 0, textAlign: 'center' }}>{monthLabel}</h2>
      </StepperNav>
      <div className="report-nav-actions">
        <button className="secondary small" onClick={() => generateReport()} disabled={generating} title="Run again">↺ Re-run</button>
        {!isCurrentMonth && (
          <button className="secondary small" onClick={() => setMonthOffset(0)}>Back to this month</button>
        )}
      </div>

      {generating ? (
        <div className="report-run-wrap">
          <div className="report-run-icon spin">📊</div>
          <h3>Gathering your {monthLabel} summary…</h3>
          <p className="muted">Just a moment.</p>
        </div>
      ) : (
      <div className="report-body" key={runKey}>
      {/* What the congregation's Service Report actually asks for — first, plainly, and only
          the figures that belong on it (CONTEXT.md › Reporting). Everything below is for the
          person's own records. */}
      <div className="card highlight report-submit">
        <h4 style={{ marginTop: 0 }}>What to submit for {monthLabel}</h4>
        <ul className="report-submit-list">
          <li>
            <span>Shared in the ministry</span>
            <strong>{participated ? 'Yes' : 'Not marked'}</strong>
          </li>
          <li>
            <span>Bible studies</span>
            <strong>{bibleStudies}</strong>
          </li>
          {reportTracksHours && (
            <li>
              <span>Hours</span>
              <strong>{fmtDuration(ministryMin)}</strong>
            </li>
          )}
          {reportTracksHours && creditMin > 0 && (
            <li>
              <span>Credit hours <span className="muted">(note in remarks)</span></span>
              <strong>{fmtDuration(creditMin)}</strong>
            </li>
          )}
        </ul>
        {reportTracksHours && isCurrentMonth && bankedMin > 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{bankedMin}m in the minute bank are not included — they carry forward.</p>
        )}
        {!reportTracksHours && (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Publishers report participation and Bible studies only; hours below are for you.</p>
        )}
      </div>

      {/* Encouragement banner */}
      <div className="card report-encourage">
        <p>{encouragement(monthPct, totalMin)}</p>
      </div>

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
                  <strong>{notHomeCalls} door{notHomeCalls !== 1 ? 's' : ''} not answered</strong>
                  <p className="muted">Persistence is a form of love — keep showing up</p>
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

      {/* Email export */}
      <div className="card">
        <h4>Email This Report</h4>
        <input
          className="full"
          type="email"
          placeholder="Send to email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="row">
          <button onClick={emailReport} disabled={!email || totalMin === 0}>
            Email Report
          </button>
          <button className="secondary" onClick={copyReport} disabled={totalMin === 0}>
            Copy Report
          </button>
        </div>
        {copyMsg && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{copyMsg}</p>}
      </div>
      </div>
      )}{/* /report-body */}

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
