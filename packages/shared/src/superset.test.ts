import { describe, it, expect } from 'vitest'

import { nextSupersetExercise, type SupersetMember } from './superset.js'

/**
 * Build a member list. Each tuple is [exerciseId, supersetGroup, orderIndex,
 * hasRemainingPlannedSet]. The list is deliberately passed unsorted in some
 * cases to prove ordering is derived from orderIndex, not array position.
 */
function members(rows: Array<[string, string | null, number, boolean]>): SupersetMember[] {
  return rows.map(([exerciseId, supersetGroup, orderIndex, hasRemainingPlannedSet]) => ({
    exerciseId,
    supersetGroup,
    orderIndex,
    hasRemainingPlannedSet,
  }))
}

describe('nextSupersetExercise', () => {
  it('advances to the next member by orderIndex that has a remaining Planned Set', () => {
    const exercises = members([
      ['a', 'g1', 0, true],
      ['b', 'g1', 1, true],
      ['c', 'g1', 2, true],
    ])
    expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'advance', exerciseId: 'b' })
    expect(nextSupersetExercise(exercises, 'b')).toEqual({ kind: 'advance', exerciseId: 'c' })
  })

  it('wraps to the first member with a remaining Planned Set when at the last', () => {
    const exercises = members([
      ['a', 'g1', 0, true],
      ['b', 'g1', 1, true],
      ['c', 'g1', 2, true],
    ])
    expect(nextSupersetExercise(exercises, 'c')).toEqual({ kind: 'advance', exerciseId: 'a' })
  })

  it('never advances onto a member with no remaining Planned Set (skips Done/all-Removed)', () => {
    // b is Done (no remaining); from a we must skip b and land on c.
    const exercises = members([
      ['a', 'g1', 0, true],
      ['b', 'g1', 1, false],
      ['c', 'g1', 2, true],
    ])
    expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'advance', exerciseId: 'c' })
  })

  it('wrap skips a member whose Sets are all Done', () => {
    // From c we wrap; a is Done, so we land on the first remaining member b.
    const exercises = members([
      ['a', 'g1', 0, false],
      ['b', 'g1', 1, true],
      ['c', 'g1', 2, true],
    ])
    expect(nextSupersetExercise(exercises, 'c')).toEqual({ kind: 'advance', exerciseId: 'b' })
  })

  it('returns the terminal signal when the whole group has zero remaining Planned Sets', () => {
    const exercises = members([
      ['a', 'g1', 0, false],
      ['b', 'g1', 1, false],
      ['c', 'g1', 2, false],
    ])
    expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'complete' })
  })

  it('returns no-op when the current exercise is standalone (supersetGroup null)', () => {
    const exercises = members([
      ['a', null, 0, true],
      ['b', 'g1', 1, true],
      ['c', 'g1', 2, true],
    ])
    expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'noop' })
  })

  it('returns no-op when the current exercise is not found', () => {
    const exercises = members([['a', 'g1', 0, true]])
    expect(nextSupersetExercise(exercises, 'zzz')).toEqual({ kind: 'noop' })
  })

  describe('two-member group', () => {
    it('A done → B', () => {
      const exercises = members([
        ['a', 'g1', 0, true],
        ['b', 'g1', 1, true],
      ])
      expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'advance', exerciseId: 'b' })
    })

    it('B done with A still owing → back to A', () => {
      // After B's set: B has no remaining, A still owes.
      const exercises = members([
        ['a', 'g1', 0, true],
        ['b', 'g1', 1, false],
      ])
      expect(nextSupersetExercise(exercises, 'b')).toEqual({ kind: 'advance', exerciseId: 'a' })
    })

    it('if only two and the partner is done, stays on the still-owing current member', () => {
      // A still owes, B done. From A, wrap lands back on A (only remaining member).
      const exercises = members([
        ['a', 'g1', 0, true],
        ['b', 'g1', 1, false],
      ])
      expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'advance', exerciseId: 'a' })
    })
  })

  it('only considers members of the current exercise group', () => {
    // A second Superset g2 must not be a rotation target for g1.
    const exercises = members([
      ['a', 'g1', 0, false],
      ['x', 'g2', 1, true],
      ['b', 'g1', 2, true],
    ])
    expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'advance', exerciseId: 'b' })
  })

  it('derives order from orderIndex, not array position', () => {
    const exercises = members([
      ['c', 'g1', 2, true],
      ['a', 'g1', 0, true],
      ['b', 'g1', 1, true],
    ])
    expect(nextSupersetExercise(exercises, 'a')).toEqual({ kind: 'advance', exerciseId: 'b' })
    expect(nextSupersetExercise(exercises, 'c')).toEqual({ kind: 'advance', exerciseId: 'a' })
  })
})
