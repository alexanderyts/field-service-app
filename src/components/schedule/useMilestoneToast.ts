import { useEffect, useRef, useState } from 'react'
import { milestoneToastText, type ProgressSnapshot } from '../../milestones'

const TOAST_MS = 2600

/**
 * Milestone moments (25/50/75/100% of the month, of the service year), found by comparing each
 * render's totals with the previous ones — so every write path (quick log, bank roll-over,
 * submitted block, an edit) is caught without teaching each one about toasts.
 *
 * AUDIT F052, two ways it went wrong before:
 * - The baseline was taken on the very first render, when the live query still reads as no
 *   logs at all, so opening the tab "crossed" every milestone up to the current total. The
 *   baseline now waits for `loaded`.
 * - The hide timer belonged to the effect that showed the toast, so the next totals change
 *   cancelled it and the toast stayed forever. It now hangs off the toast itself.
 */
export function useMilestoneToast(opts: {
  loaded: boolean
  enabled: boolean
  current: ProgressSnapshot
  monthGoalMin: number
  yearGoalMin: number
  monthName: string
}): string | null {
  const { loaded, enabled, current, monthGoalMin, yearGoalMin, monthName } = opts
  const [toast, setToast] = useState<string | null>(null)
  const baselineRef = useRef<ProgressSnapshot | null>(null)

  useEffect(() => {
    if (!loaded) return
    const prev = baselineRef.current
    baselineRef.current = current
    if (!prev || !enabled) return
    const msg = milestoneToastText(prev, current, monthGoalMin, yearGoalMin, monthName)
    if (msg) setToast(msg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, current.month, current.year])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(t)
  }, [toast])

  return toast
}
