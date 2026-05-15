import type { WorkoutSet } from './models.js'

export const isDoneSet = (s: WorkoutSet): boolean => s.done

export const getDoneSets = (sets: WorkoutSet[]): WorkoutSet[] => sets.filter(isDoneSet)
