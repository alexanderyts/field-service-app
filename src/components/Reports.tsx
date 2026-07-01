import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TimeCategory } from '../db'
import { CREDIT_CAP_HOURS, monthTotals, yearlyApplied } from '../timeStats'

const CATEGORY_LABELS: Record<TimeCategory, string> = {
  ministry: 'Ministry',
  ldc: 'LDC (Construction)',
  hlc: 'HLC',
  convention: 'Convention',
  assembly: 'Assembly',
  bethel: 'Bethel',
  other: 'Other',
}

const CATEGORY_EMOJI: Record<TimeCategory, string> = {
  ministry: '🏠',
  ldc: '🔨',
  hlc: '🏥',
  convention: '🎤',
  assembly: '🎙️',
  bethel: '🏛️',
  other: '✨',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtH(min: number) {
  return (min / 60).toFixed(1) + 'h'
}

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
  const [ran, setRan] = useState(false)
  const [runKey, setRunKey] = useState(0)

  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const targetYear = targetDate.getFullYear()
  const targetMonth = targetDate.getMonth()

  const logs = useLiveQuery(() => db.timeLogs.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const prefs = useLiveQuery(() => db.schedulePrefs.toArray(), [])

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

  // Longest single day
  const byDay = new Map<string, number>()
  for (const l of monthLogs) {
    const key = new Date(l.date).toLocaleDateString()
    byDay.set(key, (byDay.get(key) ?? 0) + l.minutes)
  }
  let longestDay: { label: string; min: number } | null = null
  for (const [key, min] of byDay) {
    if (!longestDay || min > longestDay.min) {
      const d = new Date(key)
      longestDay = {
        label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        min,
      }
    }
  }

  // Most active day of week
  const byDow = new Array(7).fill(0)
  for (const [key, min] of byDay) {
    byDow[new Date(key).getDay()] += min
  }
  const maxDow = byDow.indexOf(Math.max(...byDow))
  const mostActiveDay = byDow[maxDow] > 0 ? DAY_NAMES[maxDow] : null

  // Call stats
  const notHomeCalls = monthCalls.filter((c) => c.notHome).length
  const atHomeCalls = monthCalls.filter((c) => !c.notHome).length
  const scripturesShared = monthCalls.filter((c) => c.scriptures?.trim()).length
  const returnVisits = monthAppts.length

  // Yearly
  const yearAppliedMin = yearlyApplied(logs, targetYear)
  const yearGoalMin = (prefs?.[0]?.yearlyHours ?? 0) * 60
  const monthGoalMin = (prefs?.[0]?.weeklyHours ?? 0) * 60 * 4.3
  const monthPct = monthGoalMin > 0 ? Math.min(100, Math.round((appliedMin / monthGoalMin) * 100)) : 0
  const yearPct = yearGoalMin > 0 ? Math.min(100, Math.round((yearAppliedMin / yearGoalMin) * 100)) : 0

  const monthLabel = targetDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const isCurrentMonth = monthOffset === 0

  function emailReport() {
    let body = `Field Service Report — ${monthLabel}\n\n`
    body += `Total Hours: ${fmtH(totalMin)}\n`
    if (ministryMin) body += `  Ministry: ${fmtH(ministryMin)}\n`
    if (creditMin) body += `  Credit Hours: ${fmtH(creditMin)}\n`
    for (const [cat, min] of catEntries) {
      if (cat !== 'ministry') body += `  ${CATEGORY_LABELS[cat]}: ${fmtH(min)}\n`
    }
    if (returnVisits) body += `\nReturn Visits Scheduled: ${returnVisits}\n`
    if (newContacts.length) body += `New Contacts Added: ${newContacts.length}\n`
    if (atHomeCalls) body += `Conversations: ${atHomeCalls}\n`
    if (notHomeCalls) body += `Not at Home: ${notHomeCalls}\n`
    if (scripturesShared) body += `Scriptures Shared: ${scripturesShared}\n`
    if (yearGoalMin) body += `\nYearly Goal Progress: ${fmtH(yearAppliedMin)} of ${fmtH(yearGoalMin)} (${yearPct}%)\n`
    const subject = `Field Service Report — ${monthLabel}`
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  if (!ran) {
    return (
      <div className="view">
        <div className="report-nav">
          <button className="icon-btn" onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
          <h2 className="applet-title" style={{ margin: 0, textAlign: 'center' }}>{monthLabel}</h2>
          <button className="icon-btn" onClick={() => setMonthOffset((o) => o + 1)} disabled={monthOffset >= 0}>›</button>
        </div>
        <div className="report-run-wrap">
          <div className="report-run-icon">📊</div>
          <h3>Ready when you are</h3>
          <p className="muted">Tap to see your {monthLabel} summary.</p>
          <button onClick={() => { setRan(true); setRunKey((k) => k + 1) }}>Run Report</button>
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      {/* Month navigation */}
      <div className="report-nav">
        <button className="icon-btn" onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
        <div>
          <h2 className="applet-title" style={{ margin: 0, textAlign: 'center' }}>{monthLabel}</h2>
          {!isCurrentMonth && (
            <button className="secondary small" style={{ marginTop: 4 }} onClick={() => setMonthOffset(0)}>
              Back to this month
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button className="secondary small" onClick={() => setRunKey((k) => k + 1)} title="Run again">↺ Re-run</button>
          <button className="icon-btn" onClick={() => setMonthOffset((o) => o + 1)} disabled={monthOffset >= 0}>›</button>
        </div>
      </div>

      <div className="report-body" key={runKey}>
      {/* Encouragement banner */}
      <div className="card report-encourage">
        <p>{encouragement(monthPct, totalMin)}</p>
      </div>

      {/* Hours summary */}
      <div className="card highlight">
        <div className="report-total-row">
          <div className="report-big-num">{fmtH(totalMin)}</div>
          <div className="report-total-label">
            <span>Total hours this month</span>
            {monthGoalMin > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                Goal: {fmtH(monthGoalMin)} · {monthPct}% reached
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
                <strong>{fmtH(min)}</strong>
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
                <span className="report-highlight-icon">🏆</span>
                <div>
                  <strong>Longest day</strong>
                  <p className="muted">{longestDay.label} — {fmtH(longestDay.min)}</p>
                </div>
              </div>
            )}
            {mostActiveDay && byDay.size > 1 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon">📅</span>
                <div>
                  <strong>Most active day</strong>
                  <p className="muted">{mostActiveDay}s were your busiest this month</p>
                </div>
              </div>
            )}
            {returnVisits > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon">🔄</span>
                <div>
                  <strong>{returnVisits} return visit{returnVisits !== 1 ? 's' : ''} scheduled</strong>
                  <p className="muted">People who wanted to hear more — great work!</p>
                </div>
              </div>
            )}
            {newContacts.length > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon">👋</span>
                <div>
                  <strong>{newContacts.length} new contact{newContacts.length !== 1 ? 's' : ''} added</strong>
                  <p className="muted">{newContacts.map((p) => p.name).join(', ')}</p>
                </div>
              </div>
            )}
            {atHomeCalls > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon">🗣️</span>
                <div>
                  <strong>{atHomeCalls} conversation{atHomeCalls !== 1 ? 's' : ''} logged</strong>
                  <p className="muted">Every door opened is a door that mattered</p>
                </div>
              </div>
            )}
            {scripturesShared > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon">📖</span>
                <div>
                  <strong>{scripturesShared} scripture{scripturesShared !== 1 ? 's' : ''} shared</strong>
                  <p className="muted">Planting seeds that last</p>
                </div>
              </div>
            )}
            {notHomeCalls > 0 && (
              <div className="report-highlight-item">
                <span className="report-highlight-icon">🚪</span>
                <div>
                  <strong>{notHomeCalls} door{notHomeCalls !== 1 ? 's' : ''} not answered</strong>
                  <p className="muted">Persistence is a form of love — keep showing up</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credit hours note */}
      {creditUsed && (
        <div className="card">
          <h4>Credit Hours Applied</h4>
          <p style={{ fontSize: 14 }}>
            You used credit hours this month. Up to <strong>{CREDIT_CAP_HOURS}h</strong> count toward your goal.
            <br />
            Hours applied: <strong>{fmtH(appliedMin)}</strong>
            {totalMin > CREDIT_CAP_HOURS * 60 && (
              <span className="muted"> ({fmtH(totalMin - appliedMin)} over the cap)</span>
            )}
          </p>
        </div>
      )}

      {/* Yearly progress */}
      {yearGoalMin > 0 && (
        <div className="card">
          <h4>Yearly Goal — {targetYear}</h4>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${yearPct}%` }} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {fmtH(yearAppliedMin)} of {fmtH(yearGoalMin)} — {yearPct}% complete
          </p>
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
        <button onClick={emailReport} disabled={!email || totalMin === 0}>
          Email Report
        </button>
      </div>
      </div>{/* /report-body */}
    </div>
  )
}
