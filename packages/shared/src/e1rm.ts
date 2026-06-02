import type { WorkoutSet } from './models.js'

/** The minimal Set shape the e1RM calculator reads. A full WorkoutSet satisfies it. */
type E1rmSet = Pick<WorkoutSet, 'reps' | 'weightKg'>

/**
 * Estimated 1-rep max for a single set via the Epley formula:
 * weight × (1 + reps/30). Returns null when the set can't yield a meaningful
 * estimate — no logged weight, or reps outside the 1–12 range where Epley holds
 * up (bodyweight reps, cardio, AMRAP sets). The one place the formula and its
 * qualifying guards live.
 */
export function e1rmOf(set: E1rmSet): number | null {
  const { reps, weightKg } = set
  if (reps === null || reps < 1 || reps > 12) {
    return null
  }
  if (weightKg === null || weightKg <= 0) {
    return null
  }
  return weightKg * (1 + reps / 30)
}

/**
 * Best e1RM across qualifying sets, or null if none qualify. A deterministic
 * strength signal fed into Progression Suggestions — the LLM keeps ownership of
 * the prescription (see ADR-0001), this just supplies a number.
 */
export function estimateE1rm(sets: E1rmSet[]): number | null {
  let best: number | null = null
  for (const set of sets) {
    const e1rm = e1rmOf(set)
    if (e1rm !== null && (best === null || e1rm > best)) {
      best = e1rm
    }
  }
  return best
}

/**
 * Best e1RM per week, oldest → newest, for sets already grouped by a week label
 * (the Postgres `IYYY-"W"IW` ISO-week key used everywhere else — volume,
 * frequency, consecutive-weeks — so "week" means one thing across the prompt).
 * Only weeks that contain a qualifying set appear: a gap in training is simply
 * absent rather than rendered as an empty slot. Weeks are sorted by label, which
 * is chronological for the zero-padded ISO-week format.
 */
export function bestE1rmPerWeek(sets: (E1rmSet & { week: string })[]): number[] {
  const bestByWeek = new Map<string, number>()
  for (const set of sets) {
    const e1rm = e1rmOf(set)
    if (e1rm === null) {
      continue
    }
    const current = bestByWeek.get(set.week)
    if (current === undefined || e1rm > current) {
      bestByWeek.set(set.week, e1rm)
    }
  }
  return [...bestByWeek.keys()].sort().map(week => bestByWeek.get(week)!)
}
