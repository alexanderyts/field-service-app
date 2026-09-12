import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DayScheduleBlock, type SchedulePrefs, type TimeCategory, type TimeLog } from '../../db'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../categories'
import { animateBankValue, collectAndFlyToMinuteBank } from '../../minuteBankFly'
import { getMinuteBank, setMinuteBank, getParticipatedMonth, setParticipatedMonth } from '../../settings'
import { displayGoalMin, effectiveMonthlyGoalMin, fmtDuration, isCredit, monthTotals, quickLogStrategy, serviceYearLabel, serviceYearRangeLabel, serviceYearlyApplied, serviceYearlyTotals } from '../../timeStats'
import { StepperNav, GoalRing } from '../SharedBits'
import { daySegments } from '../../goalSegments'
import { type AuxConfig, auxTargetHoursFor, getAuxConfig, isAuxMonth, saveAuxConfig, weeklyHoursNeeded } from '../../auxPioneering'
import { deriveRole, roleTracksHours } from '../../schedulePrefsRole'
import { milestoneReached, paceDeltaMin, paceStatus, perDayToGoal, type Pace } from '../../milestones'
import ConfirmDialog from '../ConfirmDialog'
import { DAYS, DAY_RANGE, dayTrackPct, fmtTime, startOfWeek, fmtDayMonth, fmtDayMonthFull, calendarWeekNumber, MONTH_NAMES_LONG, monthsTouchedByRange, monthLogsFor, daysLeftInMonth, monthElapsedPct, MONTH_NAMES } from './dates'
import { fmtLocalDate } from '../../localDate'
import { blocksForDate, weekSuggestedMinutesExcluding, clearWeekSchedule, mutateSchedulePrefs } from './plan'
import { InfoTip } from './InfoTip'
import { HourGoalBar } from './HourGoalBar'
import { animateHeightScroll } from './animate'
import { EditLogModal } from './EditLogModal'
import { DayActionModal } from './DayActionModal'
import { TimerCard } from './TimerCard'
import type { LogInterval } from './LogTimeForm'

type DayModalInitialLog = { hours: number; minutes: number; category?: TimeCategory; activityNote?: string; interval?: LogInterval }
import { ScheduleCalendarView } from './ScheduleCalendarView'
import { MonthlyParticipationBox } from './MonthlyParticipationBox'
import { EntriesModal } from './EntriesModal'
import { AuxPioneeringBox } from './AuxPioneeringBox'
import { ReturnVisits } from './ReturnVisits'

// No "Behind pace" chip on purpose: being short is shown as a forward plan (hours to go,
// per-day amount), never as a label that just names the shortfall (owner note, Wave 5 §C).
const PACE_LABEL: Record<Pace, string> = {
  done: 'Goal reached',
  ahead: 'Ahead of pace',
  'on-pace': 'On pace',
  behind: '',
  'not-started': '',
}

export function ScheduleMain({
  prefs,
  onRedo,
  onGoToContact,
}: {
  prefs: SchedulePrefs
  onRedo: () => void
  onGoToContact: (personId: number) => void
}) {
  const logs = useLiveQuery(() => db.timeLogs.orderBy('date').reverse().toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.orderBy('date').toArray(), []) ?? []
  const now = new Date()
  const thisWeekStartMs = startOfWeek(now).getTime()
  // Goals are shown rounded UP to a whole hour, through the same helper Reports uses.
  const ceilHourMin = displayGoalMin

  // The Service Schedule window's one view state: the mini-week (collapsed), the inline
  // month calendar, or the inline week grid. The contextual bars and the header's red X
  // move between these — replacing the old separate weekOpen flag + full-screen calendar
  // modal.
  const [scheduleView, setScheduleView] = useState<'collapsed' | 'calendar' | 'week'>('collapsed')
  // The inline month-calendar's shown month/year lives here (lifted out of
  // ScheduleCalendarView) so the one shared nav bar can step months while in calendar view,
  // the same bar that steps weeks in the week/collapsed views.
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [weekOffset, setWeekOffset] = useState(0)
  // When the navigated week straddles a month boundary, this picks which of the two
  // months' days are "active" (the other side fades) — null means "use the natural
  // default" (today's month, for the current week; the earlier month, for a navigated
  // one). Explicitly set only by the prev/next week-nav buttons flipping within a
  // straddling week; cleared whenever weekOffset changes some other way (jump-to-current,
  // jump-to-return-visit) so that week starts at its own natural default again.
  const [segmentOverride, setSegmentOverride] = useState<number | null>(null)
  const [highlightTs, setHighlightTs] = useState<number | null>(null)
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<number | null>(null)
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null)
  const RECENT_LOG_COUNT = 3
  const [showAllEntries, setShowAllEntries] = useState(false)
  const [dayModalFor, setDayModalFor] = useState<Date | null>(null)
  const [dayModalOriginRect, setDayModalOriginRect] = useState<DOMRect | null>(null)
  // Which step the day modal opens on — 'menu' for a normal day tap, 'logTime' for the
  // header's quick "+ Add time" shortcut (which defaults to today).
  const [dayModalStep, setDayModalStep] = useState<'menu' | 'logTime'>('menu')
  // Prefill for the time step when the live timer is stopped; cleared on every other open.
  const [dayModalInitialLog, setDayModalInitialLog] = useState<DayModalInitialLog | undefined>(undefined)
  // Set immediately (before the bank write/collect/fly chain even starts) so the modal's
  // other fields can start fading right away — see .time-entry-closing — while the
  // minutes field is left alone to finish its own collect animation. The modal's actual
  // morph-close only happens afterward, via closeDayModalSmoothly.
  const [dayModalClosing, setDayModalClosing] = useState(false)
  const [confirmBankRoundUp, setConfirmBankRoundUp] = useState(false)
  // The bank pill's displayed value — animated (counted up/down) rather than snapping
  // straight to whatever's in localStorage, so both the Add Time save flow and the
  // per-day quick-log flow (different code paths, same underlying bank) share one
  // consistent, always-in-sync visual.
  const [displayedBank, setDisplayedBank] = useState(() => getMinuteBank())
  // Guards the deferred setState in close-animation timeouts from firing after this view has
  // unmounted (e.g. a tab switch mid-animation) — harmless in React, but avoids the warning.
  const mountedRef = useRef(true)
  // Set true on (re)mount as well as false on unmount — otherwise React StrictMode's dev
  // mount/cleanup/mount cycle leaves it stuck false, which would kill the rAF animation loop.
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // The Service Schedule card, the progress card above it, and the animatable body frame that
  // holds the collapsed/week/calendar content. `animFromRef` carries the pre-change body height
  // captured at click time so the layout effect can animate from it; `prevViewRef` tells the
  // effect which way we moved.
  const schedCardRef = useRef<HTMLDivElement>(null)
  const progressCardRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const animFromRef = useRef<number | null>(null)
  const prevViewRef = useRef(scheduleView)
  const collapsedBodyHRef = useRef(0)
  const minimizeReleaseRef = useRef(false)
  // Incremented at the start of each expand/minimize so an in-flight animation abandons itself
  // when a newer one begins (rapid taps / minimize-during-expand), instead of both driving height.
  const animTokenRef = useRef(0)
  const defaultExpand: 'week' | 'calendar' = prefs.scheduleDefaultExpand ?? 'week'

  // Once the collapsed content is mounted: release any height the minimize animation was holding
  // (now that the mini-week — not the still-mounted week — defines the natural height, so letting
  // go can't spring back up), then cache that natural collapsed height for the next minimize.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el || scheduleView !== 'collapsed') return
    if (minimizeReleaseRef.current) {
      minimizeReleaseRef.current = false
      el.style.height = ''
      el.style.overflow = ''
    }
    if (!el.style.height) collapsedBodyHRef.current = el.offsetHeight
  })

  function progressScrollTarget(): number {
    const headerH = (document.querySelector('.app-header') as HTMLElement | null)?.offsetHeight ?? 0
    // Expanding the planner pins the planner card itself just under the header.
    const pc = schedCardRef.current
    if (!pc) return window.scrollY
    return Math.max(0, window.scrollY + pc.getBoundingClientRect().top - headerH - 10)
  }

  // Expand / switch: capture the from-height and let the layout effect animate. Minimize is
  // special — it keeps the expanded content mounted, folds the week rows (or lets the calendar
  // shrink), animates the frame down to the cached collapsed height, and only THEN swaps to the
  // mini-week, so the collapse actually plays out instead of the rows vanishing instantly.
  function changeView(next: 'collapsed' | 'calendar' | 'week') {
    const el = bodyRef.current
    if (next === 'collapsed' && scheduleView !== 'collapsed' && el) {
      const from = el.offsetHeight
      const to = collapsedBodyHRef.current || 120
      const grid = scheduleView === 'week' ? (el.querySelector('.week-grid') as HTMLElement | null) : null
      if (grid) grid.classList.add('foldup')
      el.style.height = `${from}px`
      void el.offsetHeight
      minimizeReleaseRef.current = true
      const token = ++animTokenRef.current
      animateHeightScroll(el, from, to, window.scrollY, progressScrollTarget(), () => {
        if (grid) grid.classList.remove('foldup')
        // frame stays pinned at `to` (holdHeight) — the collapsed layout effect releases it once
        // the mini-week has rendered, so there's no re-expand flash during the content swap.
        setScheduleView('collapsed')
      }, mountedRef, animTokenRef, token, true)
      return
    }
    animFromRef.current = el?.offsetHeight ?? 0
    setScheduleView(next)
  }

  // Handles EXPAND (collapsed → week/calendar) and week↔calendar SWITCH. Minimize is driven
  // directly in changeView. On expand the page glides so the progress card pins just under the
  // header (staying visible the whole time — a tiny scroll that also avoids the clamp-jump); a
  // switch keeps the same height (equal panes) and never scrolls. Kept even under
  // prefers-reduced-motion: these are short, subtle, functional transitions — and on Windows
  // "Show animations: off" that query trips, which would otherwise snap the card with no motion.
  useLayoutEffect(() => {
    const prev = prevViewRef.current
    prevViewRef.current = scheduleView
    const el = bodyRef.current
    const from = animFromRef.current
    animFromRef.current = null
    if (!el || from == null) return

    el.style.height = 'auto'
    const to = el.offsetHeight
    const expanding = prev === 'collapsed' && scheduleView !== 'collapsed'
    const toScroll = expanding ? progressScrollTarget() : window.scrollY
    el.style.height = `${from}px`
    void el.offsetHeight // reflow so the browser accepts `from` as the animation's start
    const token = ++animTokenRef.current
    animateHeightScroll(el, from, to, expanding ? window.scrollY : null, toScroll, () => {}, mountedRef, animTokenRef, token)
  }, [scheduleView])
  const [bankCollapsing, setBankCollapsing] = useState(false)

  const weekStartMs = thisWeekStartMs + weekOffset * 7 * 24 * 60 * 60 * 1000
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000

  function jumpToNextReturnVisit() {
    const next = appointments.filter((a) => a.date >= Date.now()).sort((a, b) => a.date - b.date)[0]
    if (!next) return
    const targetWeekStart = startOfWeek(new Date(next.date)).getTime()
    setSegmentOverride(null)
    setWeekOffset(Math.round((targetWeekStart - thisWeekStartMs) / (7 * 24 * 60 * 60 * 1000)))
    changeView('week')
    setHighlightTs(next.date)
  }

  const [auxConfig, setAuxConfigState] = useState<AuxConfig>(() => getAuxConfig())
  const role = deriveRole(prefs, auxConfig)
  const isPioneer = role === 'pioneer'
  function updateAuxConfig(next: AuxConfig) {
    setAuxConfigState(next)
    saveAuxConfig(next)
  }

  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  const territoryCompletions = useLiveQuery(() => db.territoryCompletions.toArray(), []) ?? []

  // Whether TODAY (not whatever week is navigated below) is a month this non-pioneer is
  // auxiliary pioneering — decides whether Add Time or the simple monthly checkbox shows.
  const currentlyAux = !isPioneer && isAuxMonth(auxConfig, now.getFullYear(), now.getMonth())
  const nonPioneerTracksHours = !isPioneer && roleTracksHours(role, prefs, auxConfig, now.getFullYear(), now.getMonth())

  // Hours still needed THIS week to hit the current month's auxiliary target by month
  // end, given what's already logged — recomputed fresh on every render from real
  // calendar math (not a flat average), so it's always representative of a mid-month
  // start, a future month with nothing logged yet, etc. Covers all three aux modes
  // (this-month/multiple-months/continuous) uniformly since it only depends on whatever
  // auxTargetHoursFor already resolved for the current month.
  const auxWeeklyGoalMin = currentlyAux
    ? weeklyHoursNeeded(
        auxTargetHoursFor(auxConfig, now.getFullYear(), now.getMonth())!,
        monthTotals(monthLogsFor(logs, now.getFullYear(), now.getMonth())).applied,
        now,
        now.getFullYear(),
        now.getMonth()
      ) * 60
    : 0

  // Top progress card tracks whichever week is navigated below — not always "today" — so
  // the month/year context at the top actually follows what the person is looking at.
  let weekMinistry = 0
  let weekCredit = 0
  for (const l of logs) {
    if (l.date >= weekStartMs && l.date < weekEndMs) {
      if (isCredit(l.category)) weekCredit += l.minutes
      else weekMinistry += l.minutes
    }
  }
  const weekTotal = weekMinistry + weekCredit

  // touchedMonths is chronological (day-by-day from weekStartMs), so [0] is always the
  // earlier month and [1] (if present) the later one — a week can touch at most 2.
  const touchedMonths = monthsTouchedByRange(weekStartMs, weekEndMs)
  const isSplitWeek = touchedMonths.length > 1
  const todaySegment = touchedMonths.findIndex((m) => m.year === now.getFullYear() && m.month === now.getMonth())
  const defaultSegment = weekOffset === 0 && todaySegment >= 0 ? todaySegment : 0
  const segment = isSplitWeek ? (segmentOverride ?? defaultSegment) : 0
  const primaryMonth = touchedMonths[segment] ?? touchedMonths[0]
  // The month the top progress card reflects: normally the navigated week's month, but when
  // the inline calendar is open it follows the calendar's shown month (so stepping months
  // advances the progress window too, mirroring how progressing weeks already drives it). The
  // weekly "this week" pace line stays anchored to the real current week (see pioneerWeeklyGoalMin).
  const displayedMonth = scheduleView === 'calendar' ? { year: calYear, month: calMonth } : primaryMonth
  const monthYearLabel = `${MONTH_NAMES_LONG[displayedMonth.month]} ${displayedMonth.year}`
  // Only meaningful for a split week — the exact day range within it that belongs to
  // whichever month is currently shown, for the "June 28 – 30" style partial label.
  const segmentBoundaryMs = (() => {
    if (!isSplitWeek) return weekStartMs
    let boundary = weekStartMs
    for (let t = weekStartMs; t < weekEndMs; t += 24 * 60 * 60 * 1000) {
      const d = new Date(t)
      if (d.getFullYear() === touchedMonths[0].year && d.getMonth() === touchedMonths[0].month) {
        boundary = t + 24 * 60 * 60 * 1000
      } else break
    }
    return boundary
  })()
  const segmentStartMs = isSplitWeek && segment === 1 ? segmentBoundaryMs : weekStartMs
  const segmentEndMs = isSplitWeek && segment === 0 ? segmentBoundaryMs : weekEndMs

  // Landing on a fresh week (not flipping segments within the current one) always
  // starts fresh — the natural default is recomputed above from weekOffset/todaySegment.
  function goToWeekOffset(next: number) {
    setSegmentOverride(null)
    setWeekOffset(next)
  }

  function goNextWeek() {
    if (isSplitWeek && segment === 0) {
      setSegmentOverride(1)
    } else {
      // Entering a new week forward always starts at its earlier month, if it splits.
      setSegmentOverride(0)
      setWeekOffset((o) => o + 1)
    }
    setHighlightTs(null)
  }

  function goPrevWeek() {
    if (isSplitWeek && segment === 1) {
      setSegmentOverride(0)
    } else {
      // Entering a new week backward lands on its later month first, if it splits —
      // the natural "last thing before where you were," matching chronological order.
      const prevOffset = weekOffset - 1
      const prevStart = thisWeekStartMs + prevOffset * 7 * 24 * 60 * 60 * 1000
      const prevMonths = monthsTouchedByRange(prevStart, prevStart + 7 * 24 * 60 * 60 * 1000)
      setSegmentOverride(prevMonths.length > 1 ? 1 : null)
      setWeekOffset(prevOffset)
    }
    setHighlightTs(null)
  }

  // The shared nav's arrows step the inline calendar's month when it's the calendar view
  // that's open (they step weeks otherwise).
  function calPrevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
    else setCalMonth((m) => m - 1)
  }
  function calNextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
    else setCalMonth((m) => m + 1)
  }

  // How many days remain in the month being viewed — only meaningful when that's the
  // actual current month, since a past/future navigated week isn't "the month you live in".
  const monthDaysLeft = daysLeftInMonth(displayedMonth.year, displayedMonth.month, now)
  const monthElapsedPctVal = monthElapsedPct(displayedMonth.year, displayedMonth.month, now)

  // Non-pioneer, no goal, not auxiliary pioneering this month — no hours involved at all,
  // just a monthly checkbox plus a couple of easy, encouraging stats. Kept as React state
  // (not read fresh each render) so toggling it in the collapsed box below immediately
  // updates the summary line up here too.
  const [participatedThisMonth, setParticipatedThisMonthState] = useState(() => getParticipatedMonth(displayedMonth.year, displayedMonth.month))
  useEffect(() => {
    setParticipatedThisMonthState(getParticipatedMonth(displayedMonth.year, displayedMonth.month))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedMonth.year, displayedMonth.month])
  function updateParticipated(participated: boolean) {
    setParticipatedThisMonthState(participated)
    setParticipatedMonth(displayedMonth.year, displayedMonth.month, participated)
  }

  const tracksHours = isPioneer || nonPioneerTracksHours
  const isCurrentMonthShown = displayedMonth.year === now.getFullYear() && displayedMonth.month === now.getMonth()
  // Bible studies as the congregation counts them: distinct people currently studying.
  const bibleStudies = people.filter((p) => p.status === 'bible-study').length
  const contactsThisMonth = people.filter((p) => {
    const d = new Date(p.createdAt)
    return d.getFullYear() === displayedMonth.year && d.getMonth() === displayedMonth.month
  }).length
  const scripturesThisMonth = calls.filter((c) => {
    if (!c.scriptures?.trim()) return false
    const d = new Date(c.date)
    return d.getFullYear() === displayedMonth.year && d.getMonth() === displayedMonth.month
  }).length
  const territoriesThisMonth = territoryCompletions.filter((t) => {
    const d = new Date(t.completedAt)
    return d.getFullYear() === displayedMonth.year && d.getMonth() === displayedMonth.month
  }).length

  // Only the "primary" month/service-year is ever shown (never both touched ones at
  // once) — a straddling week just fades out the other month's day buttons instead of
  // stacking a second progress bar, so the card is always exactly the height one month's
  // worth of content needs, with no reserved dead space for a month that isn't shown.
  const monthProgress = (() => {
    const { year, month } = displayedMonth
    const stats = monthTotals(monthLogsFor(logs, year, month))
    const goalMin = ceilHourMin(effectiveMonthlyGoalMin(prefs, auxConfig, year, month))
    return {
      year,
      month,
      applied: stats.applied,
      goalMin,
      pct: goalMin ? Math.min(100, Math.round((stats.applied / goalMin) * 100)) : 0,
    }
  })()

  // Pace against the elapsed share of the month — only meaningful for the month you're in.
  const pace = isCurrentMonthShown ? paceStatus(monthProgress.applied, monthProgress.goalMin, monthElapsedPctVal) : 'not-started'
  const paceDelta = paceDeltaMin(monthProgress.applied, monthProgress.goalMin, monthElapsedPctVal)
  const daysWord = `${monthDaysLeft} day${monthDaysLeft === 1 ? '' : 's'} left`
  const remainingMin = Math.max(0, monthProgress.goalMin - monthProgress.applied)
  const perDay = perDayToGoal(monthProgress.applied, monthProgress.goalMin, monthDaysLeft)
  // Behind and not-yet-started both point forward: what's left, and roughly how much a day
  // gets there — never a label about falling short (Wave 5 §C).
  const paceText = !isCurrentMonthShown
    ? `${monthProgress.pct}% of the goal`
    : pace === 'done' ? '🎉 Goal reached for this month'
    : pace === 'ahead' ? `${fmtDuration(paceDelta)} ahead of pace · ${daysWord}`
    : pace === 'on-pace' ? `On pace · ${daysWord}`
    : monthProgress.goalMin > 0
      ? `${fmtDuration(remainingMin)} to go · ${daysWord} · about ${fmtDuration(perDay)} a day`
      : `${daysWord}`

  // Milestone moments (25/50/75/100% of the month, 100% of the service year). Compared against
  // the previous render's totals for the *current* month, so every write path — quick log, bank
  // roll-over, submitted block, an edit — is caught without teaching each one about toasts. The
  // first render only records a baseline, so reopening the tab never re-celebrates.
  const currentMonthApplied = isCurrentMonthShown
    ? monthProgress.applied
    : monthTotals(monthLogsFor(logs, now.getFullYear(), now.getMonth())).applied
  const currentMonthGoal = isCurrentMonthShown
    ? monthProgress.goalMin
    : ceilHourMin(effectiveMonthlyGoalMin(prefs, auxConfig, now.getFullYear(), now.getMonth()))
  const currentYearApplied = serviceYearlyApplied(logs, serviceYearLabel(now))
  const [toast, setToast] = useState<string | null>(null)
  const baselineRef = useRef<{ month: number; year: number } | null>(null)
  useEffect(() => {
    const prev = baselineRef.current
    baselineRef.current = { month: currentMonthApplied, year: currentYearApplied }
    if (!prev || !tracksHours) return
    const m = milestoneReached(prev.month, currentMonthApplied, currentMonthGoal)
    const y = yearlyGoalMin > 0 ? milestoneReached(prev.year, currentYearApplied, yearlyGoalMin) : null
    const msg =
      y === 100 ? '🏆 Service-year goal reached!'
      : m === 100 ? `🎉 ${MONTH_NAMES_LONG[now.getMonth()]} goal reached!`
      : m ? `${m}% of ${MONTH_NAMES_LONG[now.getMonth()]}'s goal — keep going`
      : y ? `${y}% of the service year done`
      : null
    if (!msg) return
    setToast(msg)
    const t = window.setTimeout(() => { if (mountedRef.current) setToast(null) }, 2600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthApplied, currentYearApplied])

  // Navigated week (for the suggested-week section, which can page forward/back)
  const perDayCat: Partial<Record<TimeCategory, number>>[] = Array.from({ length: 7 }, () => ({}))
  const perDayAppointments: { title: string; date: number }[][] = Array.from({ length: 7 }, () => [])
  for (const l of logs) {
    if (l.date >= weekStartMs && l.date < weekEndMs) {
      const dow = new Date(l.date).getDay()
      perDayCat[dow][l.category] = (perDayCat[dow][l.category] ?? 0) + l.minutes
    }
  }
  for (const a of appointments) {
    if (a.date >= weekStartMs && a.date < weekEndMs) {
      perDayAppointments[new Date(a.date).getDay()].push({ title: a.title, date: a.date })
    }
  }
  const weekCategoriesUsed = CATEGORY_ORDER.filter((cat) => perDayCat.some((day) => (day[cat] ?? 0) > 0))

  // Service year (Sept–Aug): running total (all hours) + capped amount applied toward
  // the goal, for the "primary" service year only. A service-year boundary (Sept 1) is
  // always also a month boundary, so it's always a subset of the month-split cases
  // above — deriving it straight from primaryMonth keeps the two perfectly consistent
  // without a separate segment concept for service years.
  const weeklyGoalMin = prefs.weeklyHours * 60
  const yearlyGoalMin = prefs.yearlyHours * 60
  // A pioneer's weekly target is no longer a fixed figure they typed — it's derived from the
  // month: hours still needed this month ÷ weeks left, rounded up to the whole hour. So a slow
  // start automatically raises the weekly bar, and getting ahead lowers it. 0 once the month's
  // goal is already covered.
  const pioneerWeeklyGoalMin = ceilHourMin(
    weeklyHoursNeeded(
      effectiveMonthlyGoalMin(prefs, auxConfig, primaryMonth.year, primaryMonth.month) / 60,
      monthTotals(monthLogsFor(logs, primaryMonth.year, primaryMonth.month)).applied,
      now,
      primaryMonth.year,
      primaryMonth.month
    ) * 60
  )
  // The weekly goal that actually applies right now — a pioneer's own weekly target, or
  // (since non-pioneers don't have one) an aux-pioneering non-pioneer's configured weekly
  // hours. Used to size the calendar view's per-day goal rings and judge week-completion;
  // 0 when neither applies, since a goal-less week has nothing to measure against.
  const effectiveWeeklyGoalMin = isPioneer
    ? weeklyGoalMin
    : auxConfig.enabled
      ? auxConfig.weeklyHours * 60
      : prefs.goalPeriod === 'weekly'
        ? weeklyGoalMin
        : 0
  const primaryServiceYear = serviceYearLabel(new Date(displayedMonth.year, displayedMonth.month, 1))
  const yearProgress = (() => {
    const label = primaryServiceYear
    const stats = serviceYearlyTotals(logs, label)
    const applied = serviceYearlyApplied(logs, label)
    return {
      label,
      stats,
      applied,
      pct: yearlyGoalMin ? Math.min(100, Math.round((applied / yearlyGoalMin) * 100)) : 0,
      rawPct: yearlyGoalMin ? Math.min(100, (stats.total / yearlyGoalMin) * 100) : 0,
      remainingMin: Math.max(0, yearlyGoalMin - applied),
    }
  })()

  // Total suggested (planned) minutes across the navigated week, all block types and
  // any date overrides included — compared against the weekly goal so someone can see
  // how much of their target is already scheduled, both here and live while editing an
  // individual day's blocks.
  const suggestedWeeklyMin = Array.from({ length: 7 }, (_, d) =>
    blocksForDate(prefs, dayDateFor(d)).reduce((s, b) => s + (b.end - b.start), 0)
  ).reduce((a, b) => a + b, 0)

  function saveDayBlocks(date: Date, blocks: DayScheduleBlock[], repeatWeekly: boolean) {
    const day = date.getDay()
    const dateKey = fmtLocalDate(date)
    void mutateSchedulePrefs(prefs.id, (current) => {
      if (repeatWeekly) {
        const nextDaysOut = current.daysOut.includes(day) ? current.daysOut : [...current.daysOut, day].sort()
        // Storing only { blocks } intentionally drops any legacy start/end/credit fields
        // for this day — blocks are the authoritative shape from here on. Any one-off
        // override for this exact date is also cleared so it can't shadow the new plan.
        const nextSchedule = { ...(current.daySchedule ?? {}), [day]: { blocks } }
        const nextOverrides = { ...(current.dateOverrides ?? {}) }
        delete nextOverrides[dateKey]
        return { daysOut: nextDaysOut, daySchedule: nextSchedule, dateOverrides: nextOverrides }
      }
      // "Just this day" — the weekly pattern is left completely untouched.
      return { dateOverrides: { ...(current.dateOverrides ?? {}), [dateKey]: blocks } }
    })
    closeDayModalSmoothly()
  }

  // "Edit" next to the day in DayActionModal offers these as a quick way to redo a day's
  // (or the whole week's) suggested schedule without going all the way back to Redo Survey.
  function removeDaySchedule(date: Date) {
    const day = date.getDay()
    void mutateSchedulePrefs(prefs.id, (current) => {
      const nextSchedule = { ...(current.daySchedule ?? {}) }
      delete nextSchedule[day]
      const nextOverrides = { ...(current.dateOverrides ?? {}) }
      delete nextOverrides[fmtLocalDate(date)]
      return { daysOut: current.daysOut.filter((d) => d !== day), daySchedule: nextSchedule, dateOverrides: nextOverrides }
    })
    closeDayModalSmoothly()
  }

  function clearAllSuggestedDays() {
    db.schedulePrefs.update(prefs.id, { daysOut: [], daySchedule: {}, dateOverrides: {} })
    closeDayModalSmoothly()
  }

  // Closing the day-tap modal by morphing it back down toward the day row it was opened
  // from (see dayModalOriginRect, captured at the moment that row was tapped) and fading
  // the backdrop out, rather than instantly unmounting — an instant unmount read as the
  // dimmed background suddenly flashing bright again.
  function closeDayModalSmoothly() {
    const modalEl = document.querySelector('.day-action-modal') as HTMLElement | null
    const backdropEl = document.querySelector('.day-modal-backdrop') as HTMLElement | null
    if (modalEl && dayModalOriginRect) {
      const r = modalEl.getBoundingClientRect()
      const scaleX = r.width ? dayModalOriginRect.width / r.width : 1
      const scaleY = r.height ? dayModalOriginRect.height / r.height : 1
      const tx = (dayModalOriginRect.left + dayModalOriginRect.width / 2) - (r.left + r.width / 2)
      const ty = (dayModalOriginRect.top + dayModalOriginRect.height / 2) - (r.top + r.height / 2)
      modalEl.style.setProperty('--closeTX', `${tx}px`)
      modalEl.style.setProperty('--closeTY', `${ty}px`)
      modalEl.style.setProperty('--closeSX', `${scaleX}`)
      modalEl.style.setProperty('--closeSY', `${scaleY}`)
      modalEl.classList.add('day-modal-closing')
    }
    backdropEl?.classList.add('closing')
    window.setTimeout(() => { if (mountedRef.current) setDayModalFor(null) }, 180)
  }

  function dayDateFor(day: number): Date {
    return new Date(weekStartMs + day * 24 * 60 * 60 * 1000)
  }

  // Opens the shared day-action modal, capturing the tapped element's rect so it can morph
  // back down toward it on close. `step` is 'menu' for a normal day tap, 'logTime' for the
  // header's quick-add shortcut.
  function openDayModal(date: Date, rect: DOMRect, step: 'menu' | 'logTime' = 'menu', initialLog?: DayModalInitialLog) {
    setDayModalOriginRect(rect)
    setDayModalClosing(false)
    setDayModalStep(step)
    setDayModalInitialLog(initialLog)
    setDayModalFor(date)
  }

  // Whether a day in the navigated week falls in the month the progress card is
  // currently showing (monthProgress) — false for the "other side" of a week that
  // straddles a month boundary, so those day buttons can be faded instead of implying
  // they count toward the month shown above.
  function isDayInShownMonth(day: number): boolean {
    const d = dayDateFor(day)
    return d.getFullYear() === monthProgress.year && d.getMonth() === monthProgress.month
  }

  // Logging service time for a specific day — leftover ministry minutes always bank; nothing
  // is ever rounded up (tracking-first D5).
  async function saveQuickLog(date: Date, totalMin: number, category: TimeCategory, activityNote: string, interval?: LogInterval) {
    if (totalMin <= 0) return
    const d = new Date(date)
    d.setHours(12, 0, 0, 0)
    await db.timeLogs.add({
      date: d.getTime(),
      minutes: totalMin,
      category,
      activityNote: activityNote.trim() || undefined,
      // The live timer's real interval rides along for the person's own records (0.24.0).
      startedAt: interval?.startedAt,
      endedAt: interval?.endedAt,
    } as TimeLog)
  }

  // Logs a scheduled day's planned blocks as real time entries (one per block, by category), then
  // clears that date's scheduled blocks via a date-override so the same time can't be submitted
  // twice — the recurring weekly pattern (other weeks) is untouched. "Submit all remaining."
  async function submitScheduledTime(date: Date) {
    await db.transaction('rw', db.timeLogs, db.schedulePrefs, async () => {
      const current = await db.schedulePrefs.get(prefs.id)
      if (!current) return
      const blocks = blocksForDate(current, date)
      if (blocks.length === 0) return
      const d = new Date(date)
      d.setHours(12, 0, 0, 0)
      for (const b of blocks) {
        const min = b.end - b.start
        if (min > 0) await db.timeLogs.add({ date: d.getTime(), minutes: min, category: b.category } as TimeLog)
      }
      await db.schedulePrefs.update(prefs.id, { dateOverrides: { ...(current.dateOverrides ?? {}), [fmtLocalDate(date)]: [] } })
    })
  }

  // Submit ONE scheduled block: log it, then remove just that block from that date (a date-override
  // holding the remaining blocks). It can't be submitted again and "moves off" the day; the recurring
  // weekly pattern stays intact. The day's ring then reads it as filled (logged) + the rest hollow.
  async function submitScheduledBlock(date: Date, blockIndex: number) {
    await db.transaction('rw', db.timeLogs, db.schedulePrefs, async () => {
      const current = await db.schedulePrefs.get(prefs.id)
      if (!current) return
      const dayBlocks = blocksForDate(current, date)
      const b = dayBlocks[blockIndex]
      if (!b) return
      const d = new Date(date)
      d.setHours(12, 0, 0, 0)
      const min = b.end - b.start
      if (min > 0) await db.timeLogs.add({ date: d.getTime(), minutes: min, category: b.category } as TimeLog)
      const remaining = dayBlocks.filter((_, i) => i !== blockIndex)
      await db.schedulePrefs.update(prefs.id, { dateOverrides: { ...(current.dateOverrides ?? {}), [fmtLocalDate(date)]: remaining } })
    })
  }

  // Remove ONE scheduled block from a date without logging it (date-override with the rest).
  async function deleteScheduledBlock(date: Date, blockIndex: number) {
    await mutateSchedulePrefs(prefs.id, (current) => {
      const dayBlocks = blocksForDate(current, date)
      if (!dayBlocks[blockIndex]) return null
      const remaining = dayBlocks.filter((_, i) => i !== blockIndex)
      return { dateOverrides: { ...(current.dateOverrides ?? {}), [fmtLocalDate(date)]: remaining } }
    })
  }

  // Clears one day completely — deletes that date's logged time entries AND hides its
  // scheduled instance (an empty date-override, leaving the recurring weekly pattern intact).
  // Reached from the ✕ on each week-view day row.
  const [confirmClearDay, setConfirmClearDay] = useState<Date | null>(null)
  async function clearDay(date: Date) {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
    await db.transaction('rw', db.timeLogs, db.schedulePrefs, async () => {
      const current = await db.schedulePrefs.get(prefs.id)
      await db.timeLogs.where('date').between(dayStart.getTime(), dayEnd.getTime(), true, true).delete()
      if (current && blocksForDate(current, date).length > 0) {
        await db.schedulePrefs.update(prefs.id, { dateOverrides: { ...(current.dateOverrides ?? {}), [fmtLocalDate(date)]: [] } })
      }
    })
  }

  async function bankQuickLogMinutes(
    date: Date,
    h: number,
    m: number,
    category: TimeCategory,
    activityNote: string,
    minutesFieldEl?: HTMLElement,
    interval?: LogInterval
  ) {
    const before = getMinuteBank()
    let bank = before + m
    const autoHour = bank >= 60
    if (autoHour) bank -= 60
    // Persist EVERYTHING before any animation runs (F011). The animations below take ~1.1s,
    // and if the OS freezes/kills the backgrounded PWA in that window the logged time and the
    // decremented bank must already be durable. Order: write the DB rows, then the localStorage
    // bank (so a crash between them over-retains minutes rather than losing a logged hour),
    // then animate purely cosmetically off the already-committed values.
    if (autoHour) {
      const d = new Date(date)
      d.setHours(12, 0, 0, 0)
      // `category` is always 'ministry' here — quickLogTime logs credit whole and never
      // reaches the bank (F-A6) — so the rolled-over hour can't be misattributed.
      await db.timeLogs.add({ date: d.getTime(), minutes: 60, category, note: 'Added from minute bank' } as TimeLog)
    }
    if (h > 0) await saveQuickLog(date, h * 60, category, activityNote, interval)
    setMinuteBank(bank)
    // Keep the modal open through the gather (so the field's glow is visible), then close it
    // once the ball has launched from the field's captured position.
    await collectAndFlyToMinuteBank(minutesFieldEl)
    closeDayModalSmoothly()
    await animateBankValue(before, bank, 480, setDisplayedBank)
  }

  function quickLogTime(
    date: Date,
    h: number,
    m: number,
    category: TimeCategory,
    activityNote: string,
    originEl?: HTMLElement,
    interval?: LogInterval
  ) {
    // The bank's admission rule lives in `quickLogStrategy` (AUDIT F-A6) — credit is logged
    // whole and never enters the bank, so the hour it rolls over can't be misattributed.
    const strategy = quickLogStrategy(category, h, m)
    if (strategy === 'none') return
    if (strategy === 'whole') {
      saveQuickLog(date, h * 60 + m, category, activityNote, interval)
      closeDayModalSmoothly()
      return
    }
    // Fade the modal's other fields while the minutes field gathers into the ball; the modal
    // itself is morphed shut by bankQuickLogMinutes once the ball has launched (so the gather
    // is visible and the ball originates from the field's real position).
    setDayModalClosing(true)
    bankQuickLogMinutes(date, h, m, category, activityNote, originEl, interval)
  }

  // Pioneer weekly bar fills against the calendar-derived weekly need (not the raw weeklyHours).
  const weekMinistryPct = pioneerWeeklyGoalMin ? Math.min(100, (weekMinistry / pioneerWeeklyGoalMin) * 100) : (weekMinistry > 0 ? 100 : 0)
  const weekCreditPct = pioneerWeeklyGoalMin ? Math.min(100 - weekMinistryPct, (weekCredit / pioneerWeeklyGoalMin) * 100) : 0

  // A pioneer can build a schedule with no days and no weekly target at all — in that
  // case a "this week vs. weekly goal" bar is meaningless, so it's skipped in favor of
  // the month/year bars below. Re-adding a day (from the weekly calendar) or a weekly
  // target (by redoing the survey) brings it back automatically, since both flow into
  // this same flag.
  const hasSchedule = prefs.daysOut.length > 0 || weeklyGoalMin > 0

  // Tapping the pill logs the banked minutes now — exactly the minutes that are there, as one
  // ministry entry (only ministry minutes can enter the bank, F-A6). It used to write a whole
  // hour, which was time not spent (tracking-first D5). Counts the bank down to 0 and plays the
  // reverse of the pill's opening animation.
  async function redeemMinuteBank() {
    setConfirmBankRoundUp(false)
    const startValue = getMinuteBank()
    if (startValue <= 0) return
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    await db.timeLogs.add({ date: d.getTime(), minutes: startValue, category: 'ministry', note: 'Added from minute bank' } as TimeLog)
    setMinuteBank(0)
    await animateBankValue(startValue, 0, 380, setDisplayedBank)
    setBankCollapsing(true)
    await new Promise((resolve) => window.setTimeout(resolve, 260))
    setBankCollapsing(false)
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="applet-title">Service</h2>
      </div>

      {/* The tab's primary action (tracking-first D4): straight into the time form for today. */}
      <button
        className="log-time-cta"
        onClick={(e) => openDayModal(new Date(), e.currentTarget.getBoundingClientRect(), 'logTime')}
      >
        ＋ Log time
      </button>
      <TimerCard
        onStop={(r, el) =>
          openDayModal(new Date(r.endedAt), el?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0), 'logTime', {
            hours: r.hours, minutes: r.minutes, category: r.category, activityNote: r.activityNote,
            interval: { startedAt: r.startedAt, endedAt: r.endedAt },
          })
        }
      />

        {/* The minute bank lives here now (moved off the Service Schedule header to declutter
            it). Its own row keeps the arrival pulse clear of the title/button; the anchor is
            always rendered so the fly has a stable landing target. */}
        <div className="minute-bank-row">
          <span className="minute-bank-anchor" aria-hidden="true" />
          {(displayedBank > 0 || bankCollapsing) && (
            <div
              className={`minute-bank-pill${bankCollapsing ? ' minute-bank-collapsing' : ''}`}
              onClick={() => setConfirmBankRoundUp(true)}
              title="Tap to log these minutes now"
            >
              <span>⏱ {displayedBank}m</span>
              <div className="minute-bank-track">
                <div className="minute-bank-fill" style={{ width: `${(displayedBank / 60) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

      {/* Progress is the hero: month first, service year second, week pace last, nothing
          behind an "Expand" (docs/tracking-first-plan.md D3). The bars themselves are the
          same elements they always were — only their order and gating changed. */}
      <div className="card highlight" ref={progressCardRef}>
        <div className="goal-row" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span>{monthYearLabel}</span>
          {tracksHours && isCurrentMonthShown && pace !== 'not-started' && (
            <span className={`pace-chip pace-${pace}`}>{PACE_LABEL[pace]}</span>
          )}
        </div>

        {tracksHours ? (
          <>
            <div className="goal-row hero">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {MONTH_NAMES_LONG[monthProgress.month]}
                <InfoTip
                  text={
                    !isPioneer && currentlyAux && isCurrentMonthShown
                      ? 'Hours logged this month toward your auxiliary pioneering target.'
                      : 'Hours logged this month toward your monthly goal.'
                  }
                />
              </span>
              <strong>{fmtDuration(monthProgress.applied)} / {fmtDuration(monthProgress.goalMin)}</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${monthProgress.pct}%` }} />
            </div>
            <p className="pace-line">{paceText}</p>

            {(isPioneer || prefs.goalPeriod === 'yearly') && (
              <div style={{ marginTop: 10 }}>
                <div className="goal-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Service year <span className="muted" style={{ fontSize: 11 }}>({serviceYearRangeLabel(yearProgress.label)})</span>
                    <InfoTip text={`Hours applied toward your yearly goal${isPioneer ? ' (credit hours capped at 55h/month)' : ''} — the lighter fill shows everything logged, uncapped.`} />
                  </span>
                  <strong>
                    {fmtDuration(yearProgress.applied)} / {fmtDuration(yearlyGoalMin)}
                  </strong>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill raw" style={{ width: `${yearProgress.rawPct}%` }} />
                  <div className="progress-fill" style={{ width: `${yearProgress.pct}%` }} />
                </div>
                {isPioneer && (
                  <div className="legend tight">
                    <span><i className="sw ministry" /> Ministry {fmtDuration(yearProgress.stats.ministry)}</span>
                    <span><i className="sw credit" /> Credit {fmtDuration(yearProgress.stats.credit)}</span>
                  </div>
                )}
                {yearProgress.stats.total > yearProgress.applied && (
                  <p className="muted">
                    {fmtDuration(yearProgress.stats.total)} logged in total this service year — 55h/mo credit cap applies.
                  </p>
                )}
                <p className="goal-remaining">
                  {yearProgress.remainingMin > 0
                    ? `${fmtDuration(yearProgress.remainingMin)} left to reach your yearly goal`
                    : yearlyGoalMin > 0 ? '🎉 Yearly goal reached!' : ''}
                </p>
              </div>
            )}

            {isPioneer && hasSchedule && (
              <div style={{ marginTop: 10 }}>
                <div className="goal-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {weekOffset === 0 ? 'This week' : `Week of ${fmtDayMonth(weekStartMs)}`}
                    <InfoTip text="Hours you need this week to stay on pace for your yearly goal — worked out from the hours still needed this month and the weeks left in it, rounded up to the whole hour." />
                  </span>
                  <strong>
                    {pioneerWeeklyGoalMin > 0
                      ? `${fmtDuration(weekTotal)} / ${fmtDuration(pioneerWeeklyGoalMin)}`
                      : `${fmtDuration(weekTotal)} · on pace 🎉`}
                  </strong>
                </div>
                <div className="progress-bar split">
                  <div className="progress-fill ministry" style={{ width: `${weekMinistryPct}%` }} />
                  <div className="progress-fill credit" style={{ width: `${weekCreditPct}%` }} />
                </div>
              </div>
            )}
            {!isPioneer && currentlyAux && (
              <div style={{ marginTop: 10 }}>
                <div className="goal-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    This week
                    <InfoTip text="Hours still needed this week to hit your auxiliary pioneering target by month end, based on what's already logged and how many weeks remain." />
                  </span>
                  <strong>{fmtDuration(weekTotal)} / {fmtDuration(auxWeeklyGoalMin)}</strong>
                </div>
                <HourGoalBar appliedMin={weekTotal} goalMin={auxWeeklyGoalMin} />
              </div>
            )}
            {!isPioneer && !currentlyAux && prefs.goalPeriod === 'weekly' && (
              <div style={{ marginTop: 10 }}>
                <div className="goal-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {weekOffset === 0 ? 'This week' : `Week of ${fmtDayMonth(weekStartMs)}`}
                    <InfoTip text="Hours logged this week toward your weekly goal." />
                  </span>
                  <strong>{fmtDuration(weekTotal)} / {fmtDuration(weeklyGoalMin)}</strong>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${weeklyGoalMin ? Math.min(100, (weekTotal / weeklyGoalMin) * 100) : 0}%` }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p className="pace-line" style={{ marginTop: 0 }}>
              {participatedThisMonth ? '✓ Shared in the ministry this month' : 'Not yet marked as shared in the ministry this month'}
            </p>
            <p className="muted">📖 {bibleStudies} Bible stud{bibleStudies === 1 ? 'y' : 'ies'}</p>
            {contactsThisMonth > 0 && (
              <p className="muted">👋 {contactsThisMonth} contact{contactsThisMonth === 1 ? '' : 's'} recorded this month</p>
            )}
            {scripturesThisMonth > 0 && (
              <p className="muted">✨ {scripturesThisMonth} scripture{scripturesThisMonth === 1 ? '' : 's'} shared this month</p>
            )}
            {territoriesThisMonth > 0 && (
              <p className="muted">🗺️ {territoriesThisMonth} custom territor{territoriesThisMonth === 1 ? 'y' : 'ies'} completed this month</p>
            )}
          </div>
        )}

        {!isPioneer && <AuxPioneeringBox config={auxConfig} onChange={updateAuxConfig} />}
      </div>

      {/* Non-pioneers not tracking hours just check a single box off once a month; everyone
          who tracks hours logs via day taps (or the header's "+ Add time" shortcut). */}
      {!isPioneer && !nonPioneerTracksHours && (
        <MonthlyParticipationBox
          month={displayedMonth.month}
          participated={participatedThisMonth}
          onChange={updateParticipated}
        />
      )}

      {/* Service Schedule — mini week (collapsed), inline month calendar, or inline week grid */}
      <div className="card sched-card" ref={schedCardRef}>
        {/* The prose that used to sit above the nav (subtitle + "Planned this week") now lives in
            the ⓘ tooltip, so nothing above the nav appears/disappears between views — the nav bar
            holds one fixed position and the expand/minimize animation stays clean. The quick
            toggle (collapsed only) jumps straight to whichever view isn't the default. */}
        <div className="service-sched-header">
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            Service Schedule
            {weeklyGoalMin > 0 && (
              <InfoTip
                text={`Optional: days and times you plan to be out. Planned this week: ${fmtDuration(suggestedWeeklyMin)}. Logged so far: ${fmtDuration(weekTotal)} of ${fmtDuration(weeklyGoalMin)}.`}
              />
            )}
          </h4>
          {scheduleView === 'collapsed' && (
            <button
              className="icon-btn sched-quick-toggle"
              data-tutorial="calendar-view-btn"
              onClick={() => changeView(defaultExpand === 'calendar' ? 'week' : 'calendar')}
              title={defaultExpand === 'calendar' ? 'Open week view' : 'Open calendar view'}
              aria-label={defaultExpand === 'calendar' ? 'Open week view' : 'Open calendar view'}
            >
              {defaultExpand === 'calendar' ? '🗓️' : '📅'}
            </button>
          )}
        </div>

        {/* One persistent nav bar for collapsed / week / calendar. Only the label and what the
            arrows step (weeks vs the inline calendar's month) change between views, so switching
            never shifts the bar. Single-line uniform label so week and month labels read alike. */}
        <StepperNav
          className="sched-nav"
          onPrev={scheduleView === 'calendar' ? calPrevMonth : goPrevWeek}
          onNext={scheduleView === 'calendar' ? calNextMonth : goNextWeek}
        >
          <div className="week-nav-label">
            {scheduleView === 'calendar' ? (
              <span>{MONTH_NAMES[calMonth]} {calYear}</span>
            ) : (
              <span>
                {segmentEndMs - segmentStartMs <= 24 * 60 * 60 * 1000
                  ? fmtDayMonthFull(segmentStartMs)
                  : `${fmtDayMonth(segmentStartMs)} – ${fmtDayMonth(segmentEndMs - 86400000)}`}
                {` · Week ${calendarWeekNumber(weekStartMs)}`}
              </span>
            )}
          </div>
        </StepperNav>

        {/* The one element whose height the expand/minimize animation drives — everything that
            differs between collapsed / week / calendar lives inside it, so growing this frame (in
            sync with the page scroll) moves the whole view as one piece. */}
        <div className={`sched-body-frame view-${scheduleView}`} ref={bodyRef}>
        {scheduleView === 'collapsed' && (
          <>
            <div className="week-mini">
              {DAYS.map((d, i) => {
                const blocks = blocksForDate(prefs, dayDateFor(i))
                const isService = blocks.length > 0
                const logged = Object.values(perDayCat[i]).reduce((a, b) => a + b, 0)
                const hasVisit = perDayAppointments[i].length > 0
                // Same ring language as the calendar — each arc is that day's share of the weekly
                // goal (hollow = scheduled, filled = logged), multiple ministry types accumulating.
                const segments = daySegments(
                  blocks.map((b) => ({ category: b.category, minutes: b.end - b.start })),
                  perDayCat[i],
                  effectiveWeeklyGoalMin,
                )
                return (
                  <div
                    key={i}
                    className={`mini-day${isService ? ' service' : ''}${logged > 0 ? ' done' : ''}${isDayInShownMonth(i) ? '' : ' faded'}`}
                    onClick={(e) => openDayModal(dayDateFor(i), e.currentTarget.getBoundingClientRect())}
                    style={{ cursor: 'pointer' }}
                    title={isDayInShownMonth(i) ? undefined : `Part of ${MONTH_NAMES_LONG[dayDateFor(i).getMonth()]} — not the month shown above`}
                  >
                    {segments.length > 0 && <GoalRing segments={segments} size={30} />}
                    <span className="mini-day-letter">{d[0]}</span>
                    {hasVisit && <span className="mini-day-dot" title="Return visit scheduled" />}
                  </div>
                )
              })}
            </div>
            <button className="secondary schedule-view-bar" onClick={() => changeView(defaultExpand)}>
              ▾ Expand {defaultExpand === 'calendar' ? 'calendar' : 'week'} view
            </button>
          </>
        )}

        {scheduleView === 'week' && (
          <div className="sched-view-body">
            {/* Return-visit button always sits first so it never moves; the jump-to-current
                appears below it only when off the current week, keeping button positions stable. */}
            <div className="sched-jump-row">
              <button className="secondary small" onClick={jumpToNextReturnVisit}>
                Jump to next return visit
              </button>
              {(weekOffset !== 0 || segment !== defaultSegment) && (
                <button className="secondary small" onClick={() => { goToWeekOffset(0); setHighlightTs(null) }}>
                  ↩ Jump to current week
                </button>
              )}
            </div>
            <div className="week-grid">
              {DAYS.map((d, i) => {
                const suggestedBlocks = blocksForDate(prefs, dayDateFor(i))
                const dayEntries = CATEGORY_ORDER.map((cat) => [cat, perDayCat[i][cat] ?? 0] as const).filter(
                  ([, min]) => min > 0
                )
                const logged = dayEntries.reduce((sum, [, min]) => sum + min, 0)
                // Normally scaled to the visible day range, but if logged time ever exceeds
                // it (e.g. a long convention day plus other categories), scale to the actual
                // total instead — otherwise every segment past the edge would pile up at 100%.
                const trackScale = Math.max(DAY_RANGE, logged)
                const dayDate = new Date(weekStartMs + i * 24 * 60 * 60 * 1000)
                const isToday = dayDate.toDateString() === now.toDateString()
                const isHighlighted = highlightTs != null && new Date(highlightTs).toDateString() === dayDate.toDateString()
                const dayAppts = perDayAppointments[i]
                let cum = 0
                const inShownMonth = isDayInShownMonth(i)
                return (
                  <div
                    key={i}
                    className={`day-row${isToday ? ' today' : ''}${isHighlighted ? ' jump-highlight' : ''}${inShownMonth ? '' : ' faded'}`}
                    onClick={(e) => openDayModal(dayDate, e.currentTarget.getBoundingClientRect())}
                    style={{ cursor: 'pointer' }}
                    title={inShownMonth ? undefined : `Part of ${MONTH_NAMES_LONG[dayDate.getMonth()]} — not the month shown above`}
                  >
                    <div className="day-label">
                      <span>{d[0]}</span>
                      <span className="day-num">{dayDate.getDate()}</span>
                    </div>
                    <div className="day-track">
                      {suggestedBlocks.map((b, bi) => {
                        const left = dayTrackPct(b.start)
                        const right = dayTrackPct(b.end)
                        return (
                          <div
                            key={`sug-${bi}`}
                            className="slot-suggested"
                            style={{
                              left: `${left}%`,
                              width: `${Math.max(0, right - left)}%`,
                              borderColor: `var(--cat-${b.category})`,
                              background: `color-mix(in srgb, var(--cat-${b.category}) 14%, transparent)`,
                            }}
                            title={`${CATEGORY_LABELS[b.category]} · ${fmtTime(b.start)} – ${fmtTime(b.end)}`}
                          />
                        )
                      })}
                      {dayEntries.map(([cat, min]) => {
                        const left = (cum / trackScale) * 100
                        cum += min
                        return (
                          <div
                            key={cat}
                            className={`slot-logged ${cat}`}
                            style={{ left: `${left}%`, width: `${(min / trackScale) * 100}%` }}
                            title={`${CATEGORY_LABELS[cat]} · ${fmtDuration(min)}`}
                          />
                        )
                      })}
                      {dayAppts.map((a, idx) => {
                        const apptMins = new Date(a.date).getHours() * 60 + new Date(a.date).getMinutes()
                        return (
                          <div
                            key={idx}
                            className="slot-appt"
                            style={{ left: `${dayTrackPct(apptMins)}%` }}
                            title={`${a.title} · ${fmtTime(apptMins)}`}
                          />
                        )
                      })}
                      {logged > 0 && <span className="day-track-total">{fmtDuration(logged)}</span>}
                    </div>
                    <span className="day-clear-slot">
                      {(suggestedBlocks.length > 0 || logged > 0) && (
                        <button
                          className="cal-week-clear-btn day-clear-btn"
                          title="Clear this day's schedule and logged time"
                          onClick={(e) => { e.stopPropagation(); setConfirmClearDay(dayDate) }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
            {/* The week view's bars show WHEN in the day time falls; this cumulative meter is the
                separate cue for whether the whole week's goal is scheduled (light fill hits the
                end) and logged (solid fill completes it). Additive to the top progress card, which
                tracks logged only. */}
            {weeklyGoalMin > 0 && (
              <div
                className={`week-goal-meter${
                  weekTotal >= weeklyGoalMin ? ' done' : suggestedWeeklyMin >= weeklyGoalMin ? ' scheduled' : ''
                }`}
              >
                <span className="wgm-cap">Weekly goal</span>
                <div className="wgm-track">
                  <span className="wgm-sched" style={{ width: `${Math.min(100, (suggestedWeeklyMin / weeklyGoalMin) * 100)}%` }} />
                  <span className="wgm-log" style={{ width: `${Math.min(100, (weekTotal / weeklyGoalMin) * 100)}%` }} />
                </div>
                <span className="wgm-state">
                  {weekTotal >= weeklyGoalMin
                    ? '✓ Goal complete'
                    : suggestedWeeklyMin >= weeklyGoalMin
                      ? '◯ Goal scheduled'
                      : `${fmtDuration(suggestedWeeklyMin)} of ${fmtDuration(weeklyGoalMin)} scheduled`}
                </span>
              </div>
            )}
            <div className="legend">
              <span><i className="sw suggested" /> Scheduled</span>
              {weekCategoriesUsed.map((cat) => (
                <span key={cat}><i className={`sw ${cat}`} /> {CATEGORY_LABELS[cat]}</span>
              ))}
              <span><i className="sw appt" /> Return Visit</span>
            </div>
            <button className="secondary schedule-view-bar" onClick={() => changeView('calendar')}>
              📅 See calendar view
            </button>
            <button className="secondary schedule-min-bar" onClick={() => changeView('collapsed')}>
              ▲ Minimize
            </button>
          </div>
        )}

        {scheduleView === 'calendar' && (
          <div className="sched-view-body">
          <ScheduleCalendarView
            prefs={prefs}
            appointments={appointments}
            logs={logs}
            people={people}
            onGoToContact={onGoToContact}
            weeklyGoalMin={effectiveWeeklyGoalMin}
            viewYear={calYear}
            viewMonth={calMonth}
            onSaveBlocks={saveDayBlocks}
            onRemoveDay={removeDaySchedule}
            onClearAllDays={clearAllSuggestedDays}
            onLogTime={quickLogTime}
            onSubmitScheduled={submitScheduledTime}
            onSubmitBlock={submitScheduledBlock}
            onDeleteBlock={deleteScheduledBlock}
            onClearWeek={(weekStart) => clearWeekSchedule(prefs, weekStart)}
            onSeeWeeklyView={() => changeView('week')}
          />
          <button className="secondary schedule-min-bar" onClick={() => changeView('collapsed')}>
            ▲ Minimize
          </button>
          </div>
        )}
        </div>
      </div>

      <ReturnVisits onGoToContact={onGoToContact} />

      <div className="card">
        <div className="recent-entries-header">
          <h4 style={{ margin: 0 }}>Recent Entries</h4>
          <button
            className="secondary small"
            title="Log service time for today"
            onClick={(e) => openDayModal(new Date(), e.currentTarget.getBoundingClientRect(), 'logTime')}
          >
            + Log time
          </button>
        </div>
        <ul className="list">
            {logs.slice(0, RECENT_LOG_COUNT).map((l) => (
              <li key={l.id} className="list-item">
                <div className="visit-info">
                  <span className={`cat-dot ${isCredit(l.category) ? 'credit' : 'ministry'}`} />
                  {/* The Activity Note is what makes the two-category model readable: a
                      pre-0.20 LDC entry now reads "Credit — LDC", not a bare "Credit". */}
                  <strong>{fmtDuration(l.minutes)}</strong> · {CATEGORY_LABELS[l.category]}
                  {[l.activityNote, l.note].filter(Boolean).map((t) => ` — ${t}`).join('')}
                  <div className="muted">
                    {new Date(l.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="visit-actions">
                  <button className="secondary small" onClick={() => setEditingLog(l)}>
                    Edit
                  </button>
                  <button className="icon-btn row-delete" title="Delete entry" aria-label="Delete this entry" onClick={() => setConfirmDeleteLogId(l.id)}>
                    🗑
                  </button>
                </div>
              </li>
            ))}
            {logs.length === 0 && <p className="muted">No time logged yet.</p>}
          </ul>
          {logs.length > RECENT_LOG_COUNT && (
            <button className="secondary small" onClick={() => setShowAllEntries(true)}>
              See all {logs.length}
            </button>
          )}
          <ConfirmDialog
            open={confirmDeleteLogId != null}
            title="Delete this time entry?"
            message="This can't be undone."
            onConfirm={() => {
              if (confirmDeleteLogId != null) db.timeLogs.delete(confirmDeleteLogId)
              setConfirmDeleteLogId(null)
            }}
            onCancel={() => setConfirmDeleteLogId(null)}
          />
          {editingLog && <EditLogModal log={editingLog} onClose={() => setEditingLog(null)} />}
        </div>


      <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
        <button className="secondary small" onClick={onRedo}>Change my goal</button>
      </div>

      {showAllEntries && (
        <EntriesModal
          logs={logs}
          onEdit={(l) => setEditingLog(l)}
          onDelete={(id) => setConfirmDeleteLogId(id)}
          onClose={() => setShowAllEntries(false)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {dayModalFor != null && (
        <DayActionModal
          date={dayModalFor}
          isSuggestedDay={blocksForDate(prefs, dayModalFor).length > 0}
          currentBlocks={blocksForDate(prefs, dayModalFor)}
          weeklyGoalMin={effectiveWeeklyGoalMin}
          otherDaysSuggestedMin={weekSuggestedMinutesExcluding(prefs, dayModalFor, dayModalFor)}
          appointments={appointments}
          people={people}
          onGoToContact={onGoToContact}
          onSaveBlocks={(blocks, repeatWeekly) => saveDayBlocks(dayModalFor, blocks, repeatWeekly)}
          onRemoveDay={() => removeDaySchedule(dayModalFor)}
          onClearAllDays={clearAllSuggestedDays}
          onLogTime={(h, m, category, activityNote, originEl, interval) => quickLogTime(dayModalFor, h, m, category, activityNote, originEl, interval)}
          onSubmitScheduled={() => submitScheduledTime(dayModalFor)}
          onSubmitBlock={(i) => submitScheduledBlock(dayModalFor, i)}
          onDeleteBlock={(i) => deleteScheduledBlock(dayModalFor, i)}
          onClose={closeDayModalSmoothly}
          closing={dayModalClosing}
          initialStep={dayModalStep}
          initialLog={dayModalInitialLog}
        />
      )}

      <ConfirmDialog
        open={confirmBankRoundUp}
        title="Log your banked minutes now?"
        message={`You have ${displayedBank}m banked. Log them as ${displayedBank}m of ministry time now, or keep banking until they make a full hour on their own.`}
        confirmLabel="Yes, log them"
        cancelLabel="Keep banking"
        tone="primary"
        onConfirm={redeemMinuteBank}
        onCancel={() => setConfirmBankRoundUp(false)}
      />

      <ConfirmDialog
        open={confirmClearDay != null}
        title="Clear this day?"
        message={confirmClearDay ? `Clears ${confirmClearDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} — its scheduled time for that date and any time you've logged that day. Your recurring weekly pattern and other days aren't affected. This can't be undone.` : ''}
        confirmLabel="Yes, clear this day"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => { if (confirmClearDay) clearDay(confirmClearDay); setConfirmClearDay(null) }}
        onCancel={() => setConfirmClearDay(null)}
      />
    </div>
  )
}

/** Edit an already-logged time entry — its date, duration, category, and note. Everything on
    the Schedule tab (weekly totals, month/year progress, the day tracks) derives from these
    same timeLogs via live queries, so a saved edit re-flows into all of them automatically —
    move an hour to a different day and it moves on the weekly schedule too. */
