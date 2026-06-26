import type { WorkoutSet, WorkoutStreak } from './models.js'
import { getDoneSets } from './set.utils.js'

/**
 * Calculate workout streak from an array of finished session dates.
 *
 * @param finishedDates - Sorted DESC array of unique 'YYYY-MM-DD' strings
 * @returns { current, longest } streak counts
 */
export function calculateStreak(finishedDates: string[]): WorkoutStreak {
  if (finishedDates.length === 0) {
    return { current: 0, longest: 0 }
  }

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

/** A single exercise that beat its previous session, with the volume gain. */
export type ExceededExercise = {
  id: string
  name: string
  delta: number
  currentVol: number
}

/** Input shape for {@link computeExceededExercises}: one entry per current-session exercise. */
export type ExceededExerciseInput = {
  id: string
  name: string
  loggedSets: WorkoutSet[]
}

/**
 * Compute the per-exercise "beat last time" list: exercises whose current done-set
 * volume exceeded the same exercise's previous-session done-set volume.
 *
 * The previous volume is guarded **per-exercise on DONE sets** (`getDoneSets`), not
 * on a session-level set count. This is the crux of the FN-001/FN-002 bug fix: if
 * the previous session has no *done* sets for an exercise (absent entirely, or present
 * but all sets `done: false` / `removedAt != null`), there is no valid comparison, so
 * `prevExVol` is `null` and the exercise is excluded. Using a raw set-count guard
 * collapses `prevExVol` to `0`, making `delta = currentVol`, which renders the full
 * exercise volume instead of the true gain.
 *
 * Input order is preserved in the output for deterministic rendering.
 *
 * @param exercises - Current-session exercises with their logged sets
 * @param prevSets - All sets from the most recent prior session
 * @returns Exercises with a positive volume gain over the previous session
 */
export function computeExceededExercises(
  exercises: ExceededExerciseInput[],
  prevSets: WorkoutSet[],
): ExceededExercise[] {
  const result: ExceededExercise[] = []
  for (const ex of exercises) {
    const currentVol = calculateVolume(getDoneSets(ex.loggedSets))
    const donePrev = getDoneSets(prevSets.filter(s => s.exerciseId === ex.id))
    const prevExVol = donePrev.length > 0 ? calculateVolume(donePrev) : null
    const delta = prevExVol !== null ? currentVol - prevExVol : null
    if (delta !== null && delta > 0 && currentVol > 0) {
      result.push({ id: ex.id, name: ex.name, delta, currentVol })
    }
  }
  return result
}
