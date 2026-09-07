export function HourGoalBar({ appliedMin, goalMin }: { appliedMin: number; goalMin: number }) {
  const wholeHours = Math.max(1, Math.ceil(goalMin / 60))
  const completedHours = Math.floor(appliedMin / 60)
  const partialFrac = Math.min(1, (appliedMin % 60) / 60)
  return (
    <div className="hour-goal-bar">
      {Array.from({ length: wholeHours }, (_, i) => (
        <div key={i} className={`hour-seg${i < completedHours ? ' full' : ''}`}>
          {i === completedHours && partialFrac > 0 && (
            <div className="hour-seg-fill" style={{ width: `${partialFrac * 100}%` }} />
          )}
        </div>
      ))}
    </div>
  )
}
