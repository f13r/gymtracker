/**
 * Round-robin selection logic for Supersets (see CONTEXT.md).
 *
 * A Superset is a group of a Session's Exercises sharing a `supersetGroup` id,
 * performed back-to-back one Set per round. When a Set is marked Done inside a
 * Superset, the logger advances the Active Exercise to the next group member —
 * by `orderIndex`, wrapping to the first — that still owes a Planned Set. A
 * member with no remaining Planned Set (every Set Done or Removed) drops out of
 * the rotation. When the whole group is exhausted, the cycle terminates and the
 * logger returns to the Overview.
 *
 * This selector is pure: no DOM, no navigation, no persistence. The caller
 * builds `hasRemainingPlannedSet` from the Session's `loggedSets` (already
 * filtered to exclude Removed Sets) so Removed Sets are invisible here by
 * construction.
 */

export interface SupersetMember {
  exerciseId: string
  /** Shared id = same Superset; null = standalone. */
  supersetGroup: string | null
  orderIndex: number
  /** True iff this member still owes a Planned Set (`done=0 AND removedAt IS NULL`). */
  hasRemainingPlannedSet: boolean
}

export type SupersetAdvance =
  /** Move the Active Exercise to `exerciseId`. */
  | { kind: 'advance'; exerciseId: string }
  /** The whole group is exhausted — terminate to the Overview. */
  | { kind: 'complete' }
  /** Current exercise is standalone (or unknown) — caller does nothing new. */
  | { kind: 'noop' }

/**
 * Decide where the logger should focus after a Set is marked Done.
 *
 * @param exercises the Session's exercise rows (any order; order is derived
 *   from `orderIndex`)
 * @param currentExerciseId the exercise whose Set was just marked Done
 */
export function nextSupersetExercise(exercises: SupersetMember[], currentExerciseId: string): SupersetAdvance {
  const current = exercises.find(e => e.exerciseId === currentExerciseId)
  if (!current || current.supersetGroup == null) {
    return { kind: 'noop' }
  }

  const group = exercises
    .filter(e => e.supersetGroup === current.supersetGroup)
    .sort((a, b) => a.orderIndex - b.orderIndex)

  // Nothing left to do anywhere in the group → terminate to the Overview.
  if (!group.some(e => e.hasRemainingPlannedSet)) {
    return { kind: 'complete' }
  }

  // Walk the group starting just after the current member, wrapping around, and
  // return the first member that still owes a Planned Set. A non-empty remaining
  // set is guaranteed by the check above, so this always finds one.
  const startIdx = group.findIndex(e => e.exerciseId === currentExerciseId)
  for (let step = 1; step <= group.length; step++) {
    const candidate = group[(startIdx + step) % group.length]
    if (candidate?.hasRemainingPlannedSet) {
      return { kind: 'advance', exerciseId: candidate.exerciseId }
    }
  }

  // Unreachable given the remaining-set guard above; kept for total safety.
  return { kind: 'complete' }
}
