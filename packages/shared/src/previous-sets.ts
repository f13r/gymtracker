/**
 * Previous-Session Reference (see CONTEXT.md).
 *
 * While logging, every Set row shows what was actually done for that Exercise
 * the last time it was done — and the reference covers *every* Done Set from
 * that occurrence, not just the ones the current Template happens to plan. If
 * last time ran to five Sets and today's Template plans three, the two extra
 * Sets are still surfaced (as `extra`) so the numbers are never truncated to
 * the Template's set count.
 *
 * Pure: the caller supplies today's Sets (Removed Sets already filtered out by
 * the Session view) and the previous occurrence's Sets; this pairs them by
 * position — set 1 against set 1 — because today's Sets are renumbered as they
 * are added and Removed, so `setNumber` is not a stable join key across
 * Sessions.
 */

import type { WorkoutSet } from './models.js'
import { getDoneSets } from './set.utils.js'

/** One previous Done Set, as shown next to (or after) today's rows. */
export interface PreviousSetReference {
  /** 1-based position within the previous occurrence's Done Sets. */
  position: number
  weightKg: number | null
  reps: number | null
}

export interface PreviousSetsAlignment {
  /**
   * The previous Done Set for each of today's Sets, by position. Entries are
   * `undefined` where the previous occurrence had fewer Sets than today.
   */
  perCurrentSet: (PreviousSetReference | undefined)[]
  /**
   * Previous Done Sets with no counterpart today — last time went further than
   * today's plan. Rendered after the current rows so nothing is hidden.
   */
  extra: PreviousSetReference[]
}

const toReference = (set: WorkoutSet, index: number): PreviousSetReference => ({
  position: index + 1,
  weightKg: set.weightKg,
  reps: set.reps,
})

/**
 * Pair today's Sets with the previous occurrence's Done Sets by position.
 *
 * @param currentSets today's Sets for the Exercise, in display order
 * @param previousSets the previous occurrence's Sets (Done-only filtering is
 *   applied here too, so an unfiltered list is safe to pass)
 */
export function alignPreviousSets(currentSets: WorkoutSet[], previousSets: WorkoutSet[]): PreviousSetsAlignment {
  const previousDone = getDoneSets(previousSets).map(toReference)

  return {
    perCurrentSet: currentSets.map((_, i) => previousDone[i]),
    extra: previousDone.slice(currentSets.length),
  }
}
