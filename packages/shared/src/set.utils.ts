import type { WorkoutSet } from './models.js'

/** Returns true if the set is a Done Set (done === true). */
export const isDoneSet = (s: WorkoutSet): boolean => Boolean(s.done)

/**
 * Filter an array of workout sets to get only the done sets.
 *
 * @param sets - Array of WorkoutSet
 * @returns New array containing only sets where done is truthy
 */
export const getDoneSets = (sets: WorkoutSet[]): WorkoutSet[] => sets.filter(isDoneSet)
