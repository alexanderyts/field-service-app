import { db, type DayScheduleBlock, type SchedulePrefs } from '../../db'
import { pruneDateOverrides } from '../../timeStats'
import { DAY_END, startOfWeek } from './dates'
import { fmtLocalDate } from '../../localDate'

function dayScheduleBlocks(prefs: SchedulePrefs, day: number): DayScheduleBlock[] {
  const entry = prefs.daySchedule?.[day]
  if (entry?.blocks?.length) return entry.blocks
  if (entry?.start != null) {
    const sessionMinutes = prefs.daysOut.length ? (prefs.weeklyHours * 60) / prefs.daysOut.length : 0
    const start = entry.start
    const end = Math.max(start, entry.end ?? Math.min(DAY_END, start + sessionMinutes))
    return [{ start, end, category: 'ministry' }]
  }
  if (prefs.daysOut.includes(day)) return [{ start: 9 * 60, end: 15 * 60, category: 'ministry' }]
  return []
}
// Suggested blocks for a specific calendar date: a one-off "just this day" override
// shadows the weekly plan entirely; otherwise the day-of-week's recurring blocks apply.
// Takes `prefs` explicitly (rather than closing over it) so both the weekly view
// (ScheduleMain) and the calendar view (ScheduleCalendarView) can call it directly.
export function blocksForDate(prefs: SchedulePrefs, date: Date): DayScheduleBlock[] {
  const override = prefs.dateOverrides?.[fmtLocalDate(date)]
  if (override) return override
  return prefs.daysOut.includes(date.getDay()) ? dayScheduleBlocks(prefs, date.getDay()) : []
}

/** Total scheduled minutes across the Sun–Sat week containing `date`, optionally skipping
    one date (the day already being edited, so its live in-progress total can be added back
    in separately without double-counting the saved version). Powers the "week total with
    this day" context in DayActionModal for any week — the weekly view's currently
    navigated one, or an arbitrary one tapped from the calendar view. */
export function weekSuggestedMinutesExcluding(prefs: SchedulePrefs, date: Date, excludeDate?: Date): number {
  const weekStart = startOfWeek(date).getTime()
  const excludeKey = excludeDate ? fmtLocalDate(excludeDate) : null
  let total = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + i * 24 * 60 * 60 * 1000)
    if (excludeKey && fmtLocalDate(d) === excludeKey) continue
    total += blocksForDate(prefs, d).reduce((s, b) => s + (b.end - b.start), 0)
  }
  return total
}

/** Clears just one week's scheduled instances — a per-date empty-blocks override for each
    of its 7 days that currently resolves to something — without touching the recurring
    daysOut/daySchedule pattern or any other week. The weekly view's "remove this day"
    taken to a whole week; reusable from either view since it takes `prefs` explicitly. */
export async function clearWeekSchedule(prefs: SchedulePrefs, weekStartDate: Date) {
  const weekStart = startOfWeek(weekStartDate).getTime()
  await mutateSchedulePrefs(prefs.id, (current) => {
    const nextOverrides = { ...(current.dateOverrides ?? {}) }
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + i * 24 * 60 * 60 * 1000)
      if (blocksForDate(current, d).length > 0) {
        nextOverrides[fmtLocalDate(d)] = []
      }
    }
    return { dateOverrides: nextOverrides }
  })
}

/** Serializes every schedule-plan write: re-reads the prefs row inside a transaction and
    computes its patch from that fresh copy rather than from a possibly-stale useLiveQuery
    render snapshot. A mutation fired before a prior one's snapshot re-propagates would
    otherwise clobber the earlier write or resurrect a just-removed block (F012). Returning
    null from `mutate` skips the write (e.g. the target block is already gone). */
export async function mutateSchedulePrefs(
  prefsId: number,
  mutate: (current: SchedulePrefs) => Partial<SchedulePrefs> | null
) {
  await db.transaction('rw', db.schedulePrefs, async () => {
    const current = await db.schedulePrefs.get(prefsId)
    if (!current) return
    const patch = mutate(current)
    if (!patch) return
    // Every plan write is also the moment stale overrides get dropped (F-C4) — here, on the
    // fresh in-transaction copy, so the prune can't race a concurrent write any more than the
    // patch itself can.
    if (patch.dateOverrides) patch.dateOverrides = pruneDateOverrides(patch.dateOverrides, new Date())
    await db.schedulePrefs.update(prefsId, patch)
  })
}

/** A tappable (i) icon that reveals a short explanation on demand. On touch, `onBlur`
    never fires reliably, so the bubble used to stay stuck open through scrolls and taps
    elsewhere. Instead it now smoothly fades out the moment the user interacts anywhere
    outside it — a tap/press, a scroll, or a resize — while still toggling shut if the (i)
    itself is tapped again. `open` keeps it mounted; `visible` drives the CSS fade so the
    bubble animates away rather than vanishing. */
