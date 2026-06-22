import type { WorkoutSet } from './models.js'

// A Set counts as Done only if it is both marked done and not Removed: a Set
// can be logged done and later soft-removed (done=1, removedAt set), and a
// Removed Set must never count toward stats (Volume, PRs). See CONTEXT.md.
export const isDoneSet = (s: WorkoutSet): boolean => s.done && s.removedAt == null

export const getDoneSets = (sets: WorkoutSet[]): WorkoutSet[] => sets.filter(isDoneSet)
