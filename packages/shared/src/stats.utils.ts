import type { WorkoutSet, WorkoutStreak } from './models.js'

/**
 * Calculate workout streak from an array of finished session dates.
 *
 * @param finishedDates - Sorted DESC array of unique 'YYYY-MM-DD' strings
 * @returns { current, longest } streak counts
 */
export function calculateStreak(finishedDates: string[]): WorkoutStreak {
  if (finishedDates.length === 0) return { current: 0, longest: 0 }

  const today = new Date().toISOString().split('T')[0]!
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!

  // Determine whether the most-recent date is close enough to seed a current streak
  const firstDay = finishedDates[0]!
  const activeStart = firstDay === today || firstDay === yesterday

  let streak = 1
  let longest = 1
  // current is only non-zero if the leading edge of the sequence touches today/yesterday
  let current = activeStart ? 1 : 0
  let currentClosed = !activeStart // once current is determined, stop updating it

  let prev = firstDay

  for (let i = 1; i < finishedDates.length; i++) {
    const day = finishedDates[i]!
    const diff = (new Date(prev).getTime() - new Date(day).getTime()) / 86400000

    if (diff === 1) {
      streak++
    } else {
      // Gap — close out current if still open
      if (!currentClosed) {
        current = streak
        currentClosed = true
      }
      streak = 1
    }

    longest = Math.max(longest, streak)

    if (!currentClosed) {
      current = streak
    }

    prev = day
  }

  return { current, longest }
}

/**
 * Calculate total volume from an array of WorkoutSets.
 * Callers are expected to pass only done sets; this function just sums.
 *
 * @param sets - Array of WorkoutSet
 * @returns Sum of (reps ?? 0) * (weightKg ?? 0) across all sets
 */
export function calculateVolume(sets: WorkoutSet[]): number {
  return sets.reduce((total, set) => total + (set.reps ?? 0) * (set.weightKg ?? 0), 0)
}
