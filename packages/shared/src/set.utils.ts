import type { WorkoutSet } from './models.js'

/**
 * Check if a workout set is done.
 * Handles the current `done: number | null` type:
 * - 1 (Done Set) → true
 * - 0 (Planned Set) → false
 * - null → false
 *
 * @param s - WorkoutSet to check
 * @returns true if the set is done, false otherwise
 */
export const isDoneSet = (s: WorkoutSet): boolean => Boolean(s.done)

/**
 * Filter an array of workout sets to get only the done sets.
 *
 * @param sets - Array of WorkoutSet
 * @returns New array containing only sets where done is truthy
 */
export const getDoneSets = (sets: WorkoutSet[]): WorkoutSet[] => sets.filter(isDoneSet)
