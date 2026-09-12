import { useState } from 'react'
import { db, type Appointment, type DayScheduleBlock, type TimeCategory } from '../../db'
import { CATEGORY_LABELS } from '../../categories'
import { creditHoursEnabled } from '../../settings'
import { fmtDuration } from '../../timeStats'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import { DAY_NAMES_FULL, fmtTime, startOfWeek, fmtDayMonth, minutesToTimeInput, timeInputToMinutes } from './dates'
import { fmtLocalDate } from '../../localDate'
import { EditAppointmentModal } from './EditAppointmentModal'
import { LogTimeForm } from './LogTimeForm'

/** A block being edited in the day modal — times as HH:MM strings for the inputs. */
interface EditableBlock {
  start: string
  end: string
  category: TimeCategory
}
export function DayActionModal({
  date,
  isSuggestedDay,
  currentBlocks,
  weeklyGoalMin,
  otherDaysSuggestedMin,
  appointments,
  people,
  onGoToContact,
  onSaveBlocks,
  onRemoveDay,
  onClearAllDays,
  onLogTime,
  onSubmitScheduled,
  onSubmitBlock,
  onDeleteBlock,
  onClose,
  closing,
  initialStep = 'menu',
}: {
  date: Date
  isSuggestedDay: boolean
  currentBlocks: DayScheduleBlock[]
  weeklyGoalMin: number
  otherDaysSuggestedMin: number
  appointments: Appointment[]
  people: { id: number; name: string; street?: string }[]
  onGoToContact: (personId: number) => void
  onSaveBlocks: (blocks: DayScheduleBlock[], repeatWeekly: boolean) => void
  onRemoveDay: () => void
  onClearAllDays: () => void
  onLogTime: (hours: number, minutes: number, category: TimeCategory, activityNote: string, originEl?: HTMLElement) => void
  onSubmitScheduled: () => void
  onSubmitBlock: (blockIndex: number) => void
  onDeleteBlock: (blockIndex: number) => void
  onClose: () => void
  closing: boolean
  initialStep?: 'menu' | 'logTime'
}) {
  const dayLabel = DAY_NAMES_FULL[date.getDay()]
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const weekStart = startOfWeek(date).getTime()
  const weekEnd = weekStart + 6 * 24 * 60 * 60 * 1000
  const weekRangeLabel = `Week of ${fmtDayMonth(weekStart)} – ${fmtDayMonth(weekEnd)}, ${new Date(weekEnd).getFullYear()}`
  const dayAppt = appointments.find((a) => fmtLocalDate(new Date(a.date)) === fmtLocalDate(date)) ?? null
  const [editingAppt, setEditingAppt] = useState(false)
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false)
  const [step, setStep] = useState<'menu' | 'window' | 'logTime' | 'dayOptions'>(initialStep)
  const [blocks, setBlocks] = useState<EditableBlock[]>(() =>
    (currentBlocks.length ? currentBlocks : [{ start: 9 * 60, end: 15 * 60, category: 'ministry' as TimeCategory }]).map(
      (b) => ({ start: minutesToTimeInput(b.start), end: minutesToTimeInput(b.end), category: b.category })
    )
  )
  const [showRepeatConfirm, setShowRepeatConfirm] = useState(false)
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [confirmSubmitScheduled, setConfirmSubmitScheduled] = useState(false)
  const scheduledTotalMin = currentBlocks.reduce((s, b) => s + Math.max(0, b.end - b.start), 0)
  // Credit off means Ministry only (the planner's block pills; the log form decides for itself).
  const availableCats: TimeCategory[] = creditHoursEnabled() ? ['ministry', 'credit'] : ['ministry']

  function blockDuration(b: EditableBlock): number {
    return timeInputToMinutes(b.end) - timeInputToMinutes(b.start)
  }
  const allBlocksValid = blocks.every((b) => blockDuration(b) > 0)
  const dayTotalMin = blocks.reduce((s, b) => s + Math.max(0, blockDuration(b)), 0)
  const liveWeeklyTotalMin = otherDaysSuggestedMin + dayTotalMin

  function updateBlock(i: number, patch: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b, bi) => (bi === i ? { ...b, ...patch } : b)))
  }

  function addBlock() {
    setBlocks((prev) => {
      // New block picks up where the last one ends (falling back to 1pm if that field
      // is currently cleared/invalid), for a natural morning → afternoon flow.
      const lastEnd = timeInputToMinutes(prev[prev.length - 1].end) || 13 * 60
      const start = Math.min(lastEnd, 22 * 60)
      return [...prev, { start: minutesToTimeInput(start), end: minutesToTimeInput(Math.min(start + 120, 23 * 60)), category: 'ministry' }]
    })
  }

  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, bi) => bi !== i))
  }

  function confirmSaveBlocks(repeatWeekly: boolean) {
    onSaveBlocks(
      blocks.map((b) => ({ start: timeInputToMinutes(b.start), end: timeInputToMinutes(b.end), category: b.category })),
      repeatWeekly
    )
    setShowRepeatConfirm(false)
  }

  const blocksSummary = blocks
    .map((b) => `${CATEGORY_LABELS[b.category]} ${fmtTime(timeInputToMinutes(b.start))}–${fmtTime(timeInputToMinutes(b.end))}`)
    .join(', ')

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop day-modal-backdrop" onClick={onClose}>
        <div className="modal day-action-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <div style={{ marginTop: -6, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>{dayLabel}</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{dateLabel}</p>
              <p className="muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{weekRangeLabel}</p>
            </div>
            {isSuggestedDay && step === 'menu' && (
              <button className="secondary small" onClick={() => setStep('dayOptions')}>Options</button>
            )}
          </div>

          {step === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dayAppt && (
                <div className="highlight-box return-visit-box">
                  <strong>📅 Return Visit</strong>
                  <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
                    {(people.find((p) => p.id === dayAppt.personId)?.name) ?? dayAppt.title}
                    {' · '}
                    {new Date(dayAppt.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {dayAppt.notes && <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{dayAppt.notes}</p>}
                  <div className="row">
                    {dayAppt.personId != null && (
                      <button className="secondary small" onClick={() => onGoToContact(dayAppt.personId!)}>
                        Jump to Contact
                      </button>
                    )}
                    <button className="secondary small" onClick={() => setEditingAppt(true)}>Edit</button>
                    <button className="danger small" onClick={() => setConfirmDeleteAppt(true)}>Delete</button>
                  </div>
                </div>
              )}
              {isSuggestedDay && scheduledTotalMin > 0 && (
                <div className="highlight-box">
                  <strong>Scheduled for this day</strong>
                  <p className="muted" style={{ margin: '3px 0 8px', fontSize: 13 }}>
                    Submit each as you do it — that logs the time and clears it from here.
                  </p>
                  {currentBlocks.map((b, i) => (
                    <div key={i} className="sched-submit-row">
                      <div className="sched-submit-info">
                        <i className="sched-submit-dot" style={{ background: `var(--cat-${b.category})` }} />
                        <span className="sched-submit-cat">{CATEGORY_LABELS[b.category]}</span>
                        <span className="muted">{fmtTime(b.start)}–{fmtTime(b.end)} · {fmtDuration(b.end - b.start)}</span>
                      </div>
                      <div className="sched-submit-actions">
                        <button className="small" onClick={() => onSubmitBlock(i)}>Submit</button>
                        <button className="secondary small" onClick={() => onDeleteBlock(i)}>Delete</button>
                      </div>
                    </div>
                  ))}
                  {currentBlocks.length > 1 && (
                    <button className="secondary" style={{ marginTop: 8 }} onClick={() => setConfirmSubmitScheduled(true)}>
                      Submit all remaining ({fmtDuration(scheduledTotalMin)})
                    </button>
                  )}
                </div>
              )}
              <button onClick={() => setStep('logTime')}>
                Log time for this day
              </button>
              <button className="secondary" onClick={() => setStep('window')}>
                {isSuggestedDay ? "Edit this day's plan" : 'Plan this day'}
              </button>
            </div>
          )}

          {step === 'dayOptions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Redo this day's schedule, or start the whole week over.
              </p>
              <button className="danger" onClick={() => setConfirmRemoveDay(true)}>
                Remove This Day's Schedule
              </button>
              <button className="danger" onClick={() => setConfirmClearAll(true)}>
                Clear All Scheduled Days
              </button>
              <button className="secondary" onClick={() => setStep('menu')}>Back</button>
            </div>
          )}

          {step === 'window' && (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Plan this day's time — pick a type and window for each stretch you want to schedule.
              </p>

              {blocks.map((b, i) => {
                const dur = blockDuration(b)
                return (
                  <div key={i} className="schedule-block" style={{ borderLeftColor: `var(--cat-${b.category})` }}>
                    <div className="schedule-block-head">
                      <div className="cat-pills">
                        {availableCats.map((cat) => (
                          <button
                            key={cat}
                            className={`chip${b.category === cat ? ' active' : ''}`}
                            onClick={() => updateBlock(i, { category: cat })}
                          >
                            {CATEGORY_LABELS[cat]}
                          </button>
                        ))}
                      </div>
                      {blocks.length > 1 && (
                        <button className="icon-btn" title="Remove this time" aria-label="Remove this time" onClick={() => removeBlock(i)}>×</button>
                      )}
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">Start time</span>
                        <input type="time" value={b.start} onChange={(e) => updateBlock(i, { start: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="field-label">End time</span>
                        <input type="time" value={b.end} onChange={(e) => updateBlock(i, { end: e.target.value })} />
                      </label>
                    </div>
                    <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                      {dur <= 0
                        ? '⚠ End time must be after start time.'
                        : `${fmtDuration(dur)} of ${CATEGORY_LABELS[b.category]} time.`}
                    </p>
                  </div>
                )
              })}

              {dayTotalMin > 0 && blocks.length > 1 && (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Total this day: {fmtDuration(dayTotalMin)}.
                </p>
              )}
              {weeklyGoalMin > 0 && (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Planned this week with this day: {fmtDuration(liveWeeklyTotalMin)} of your {fmtDuration(weeklyGoalMin)} goal
                  {liveWeeklyTotalMin >= weeklyGoalMin ? ' — 🎉 that covers it' : ''}
                </p>
              )}

              <button className="secondary" onClick={addBlock}>＋ Add More Time for This Day</button>
              <button onClick={() => setShowRepeatConfirm(true)} disabled={!allBlocksValid}>
                Save
              </button>
            </>
          )}

          {step === 'logTime' && <LogTimeForm closing={closing} onSubmit={onLogTime} />}
        </div>
      </div>

      {/* Three-way save choice (repeat weekly / just this date / cancel) — ConfirmDialog
          only supports two buttons, so this one is laid out by hand in the same style. */}
      {showRepeatConfirm && (
        <div className="modal-backdrop confirm-backdrop" onClick={() => setShowRepeatConfirm(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{`Repeat every ${dayLabel}?`}</h3>
            <p className="muted">
              This will suggest {blocksSummary} on your Weekly Schedule.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => confirmSaveBlocks(true)}>Yes, repeat every {dayLabel}</button>
              <button className="secondary" onClick={() => confirmSaveBlocks(false)}>
                No, just use this schedule for {dateLabel}
              </button>
              <button className="secondary" onClick={() => setShowRepeatConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmitScheduled}
        title="Submit this scheduled time?"
        message={`Log ${fmtDuration(scheduledTotalMin)} of scheduled time for ${dateLabel} so it counts toward your report. You can edit or delete it afterward from Recent Entries.`}
        confirmLabel="Yes, submit it"
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={() => { setConfirmSubmitScheduled(false); onSubmitScheduled(); onClose() }}
        onCancel={() => setConfirmSubmitScheduled(false)}
      />

      <ConfirmDialog
        open={confirmRemoveDay}
        title={`Remove ${dayLabel} from your schedule?`}
        message="This day's scheduled ministry window (and any scheduled credit hours) will be cleared. This can't be undone."
        confirmLabel="Yes, remove this day"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => { setConfirmRemoveDay(false); onRemoveDay() }}
        onCancel={() => setConfirmRemoveDay(false)}
      />

      <ConfirmDialog
        open={confirmClearAll}
        title="Clear all scheduled days?"
        message="This clears every scheduled day and time from your Weekly Schedule, so you can build it again from scratch. Logged time and goals aren't affected. This can't be undone."
        confirmLabel="Yes, clear all scheduled days"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => { setConfirmClearAll(false); onClearAllDays() }}
        onCancel={() => setConfirmClearAll(false)}
      />

      <ConfirmDialog
        open={confirmDeleteAppt}
        title="Delete this return visit?"
        message="This can't be undone."
        onConfirm={() => {
          if (dayAppt) db.appointments.delete(dayAppt.id)
          setConfirmDeleteAppt(false)
        }}
        onCancel={() => setConfirmDeleteAppt(false)}
      />

      {editingAppt && dayAppt && (
        <EditAppointmentModal appointment={dayAppt} people={people} onClose={() => setEditingAppt(false)} />
      )}
    </ModalPortal>
  )
}
