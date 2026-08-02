import { describe, it, expect } from 'vitest'

import type { WorkoutSet } from './models.js'
import { alignPreviousSets } from './previous-sets.js'

/** Build a Set. Each tuple is [reps, weightKg, done?, removedAt?]. */
function sets(
  rows: Array<[number, number] | [number, number, boolean] | [number, number, boolean, number]>,
): WorkoutSet[] {
  return rows.map(([reps, weightKg, done = true, removedAt = null], i) => ({
    id: `s${i + 1}`,
    sessionId: 'sess',
    exerciseId: 'ex',
    setNumber: i + 1,
    reps,
    weightKg,
    durationSec: null,
    rpe: null,
    completedAt: null,
    done,
    removedAt,
    notes: null,
  }))
}

describe('alignPreviousSets', () => {
  it('pairs each current Set with the previous occurrence Set in the same position', () => {
    const { perCurrentSet, extra } = alignPreviousSets(
      sets([
        [8, 60, false],
        [8, 60, false],
      ]),
      sets([
        [10, 55],
        [9, 57.5],
      ]),
    )

    expect(perCurrentSet).toEqual([
      { position: 1, reps: 10, weightKg: 55 },
      { position: 2, reps: 9, weightKg: 57.5 },
    ])
    expect(extra).toEqual([])
  })

  it('surfaces previous Sets beyond the current (Template-planned) set count', () => {
    const { perCurrentSet, extra } = alignPreviousSets(
      sets([
        [8, 60, false],
        [8, 60, false],
        [8, 60, false],
      ]),
      sets([
        [10, 55],
        [9, 55],
        [8, 55],
        [7, 55],
        [6, 50],
      ]),
    )

    expect(perCurrentSet.map(p => p?.position)).toEqual([1, 2, 3])
    expect(extra).toEqual([
      { position: 4, reps: 7, weightKg: 55 },
      { position: 5, reps: 6, weightKg: 50 },
    ])
  })

  it('leaves trailing current Sets unpaired when last time had fewer Sets', () => {
    const { perCurrentSet, extra } = alignPreviousSets(
      sets([
        [8, 60, false],
        [8, 60, false],
        [8, 60, false],
      ]),
      sets([[10, 55]]),
    )

    expect(perCurrentSet).toEqual([{ position: 1, reps: 10, weightKg: 55 }, undefined, undefined])
    expect(extra).toEqual([])
  })

  it('ignores previous Sets that were planned but not done, and Removed ones', () => {
    const { perCurrentSet, extra } = alignPreviousSets(
      sets([[8, 60, false]]),
      sets([
        [10, 55],
        [9, 55, false],
        [8, 55, true, 1_700_000_000_000],
        [7, 50],
      ]),
    )

    // Positions are re-derived over the Done Sets only: 55x10 then 50x7.
    expect(perCurrentSet).toEqual([{ position: 1, reps: 10, weightKg: 55 }])
    expect(extra).toEqual([{ position: 2, reps: 7, weightKg: 50 }])
  })

  it('returns no references when the Exercise has never been done', () => {
    expect(alignPreviousSets(sets([[8, 60, false]]), [])).toEqual({ perCurrentSet: [undefined], extra: [] })
  })

  it('lists every previous Set as extra when today has no Sets yet', () => {
    const { perCurrentSet, extra } = alignPreviousSets(
      [],
      sets([
        [10, 55],
        [9, 55],
      ]),
    )

    expect(perCurrentSet).toEqual([])
    expect(extra.map(p => p.position)).toEqual([1, 2])
  })
})
