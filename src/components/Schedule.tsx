import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SchedulePrefs } from '../db'
import { SurveyIntro, Survey } from './schedule/Survey'
import { ScheduleMain } from './schedule/ScheduleMain'

export default function Schedule({ onGoToContact }: { onGoToContact: (personId: number) => void }) {
  const prefs = useLiveQuery(() => db.schedulePrefs.toArray(), [])
  // Set true the moment the wizard is explicitly opened (from the intro gate below, or
  // from "Redo survey") so a brand-new user sees the intro gate exactly once, while
  // redoing an already-completed survey skips straight to the wizard like it always has.
  const [wizardOpen, setWizardOpen] = useState(false)

  if (prefs === undefined) return <div className="view" />

  const current = prefs[0]

  if (!current?.completedSurvey && !wizardOpen) {
    return (
      <SurveyIntro
        onTakeSurvey={() => setWizardOpen(true)}
        onSkip={async () => {
          const blank: Omit<SchedulePrefs, 'id'> = {
            completedSurvey: true,
            role: 'publisher',
            isPioneer: false,
            daysOut: [],
            daySchedule: {},
            weeklyHours: 0,
            yearlyHours: 0,
            goalPeriod: 'none',
          }
          await db.schedulePrefs.add(blank as SchedulePrefs)
        }}
      />
    )
  }

  if (!current || !current.completedSurvey) {
    return <Survey existing={current} onDone={() => setWizardOpen(false)} />
  }

  return (
    <ScheduleMain
      prefs={current}
      onRedo={async () => {
        await db.schedulePrefs.update(current.id, { completedSurvey: false })
        setWizardOpen(true)
      }}
      onGoToContact={onGoToContact}
    />
  )
}

/** Shown once, only for a device with no schedulePrefs record at all yet — lets someone
    skip the multi-step wizard entirely and land on a blank, goal-less schedule instead of
    being forced through survey questions before they've decided they want one. */
