import { describe, it, expect } from 'vitest'
import { e1rmOf, estimateE1rm, bestE1rmPerWeek } from './e1rm.js'
import type { WorkoutSet } from './models.js'

function doneSet(overrides: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: 'set',
    sessionId: 'session',
    exerciseId: 'exercise',
    setNumber: 1,
    reps: null,
    weightKg: null,
    durationSec: null,
    rpe: null,
    completedAt: 1000,
    done: true,
    ...overrides,
  }
}

describe('e1rmOf', () => {
  it('derives Epley e1RM for a qualifying set', () => {
    // Epley: weight × (1 + reps/30) → 100 × (1 + 5/30) = 116.666…
    expect(e1rmOf({ weightKg: 100, reps: 5 })).toBeCloseTo(116.6667, 4)
  })

  it('returns null for reps outside the 1–12 range', () => {
    expect(e1rmOf({ weightKg: 200, reps: 20 })).toBeNull()
    expect(e1rmOf({ weightKg: 200, reps: 0 })).toBeNull()
  })

  it('returns null for non-positive or null weight', () => {
    expect(e1rmOf({ weightKg: 0, reps: 5 })).toBeNull()
    expect(e1rmOf({ weightKg: -10, reps: 5 })).toBeNull()
    expect(e1rmOf({ weightKg: null, reps: 5 })).toBeNull()
  })
})

describe('estimateE1rm', () => {
  it('returns the best (highest) e1RM across multiple qualifying sets', () => {
    const sets = [
      doneSet({ weightKg: 100, reps: 5 }), // 116.67
      doneSet({ weightKg: 120, reps: 3 }), // 132.0  ← best
      doneSet({ weightKg: 90, reps: 10 }), // 120.0
    ]
    expect(estimateE1rm(sets)).toBeCloseTo(132.0, 4)
  })

  it('skips non-qualifying sets', () => {
    const sets = [
      doneSet({ weightKg: 200, reps: 20 }), // reps too high
      doneSet({ weightKg: null, reps: 5 }), // bodyweight
      doneSet({ weightKg: 80, reps: 10 }), // 106.67  ← only qualifier
    ]
    expect(estimateE1rm(sets)).toBeCloseTo(106.6667, 4)
  })

  it('returns null when no sets qualify (bodyweight / cardio)', () => {
    const sets = [
      doneSet({ weightKg: null, reps: 15 }), // bodyweight pull-up
      doneSet({ weightKg: 0, reps: null, durationSec: 1200 }), // cardio
    ]
    expect(estimateE1rm(sets)).toBeNull()
  })

  it('returns null for an empty set list', () => {
    expect(estimateE1rm([])).toBeNull()
  })
})

describe('bestE1rmPerWeek', () => {
  it('keeps the best e1RM per week, ordered oldest → newest by ISO label', () => {
    const sets = [
      { weightKg: 100, reps: 5, week: '2026-W20' }, // 116.67
      { weightKg: 90, reps: 5, week: '2026-W20' }, // same week, lower
      { weightKg: 120, reps: 3, week: '2026-W18' }, // 132.0
    ]
    const trend = bestE1rmPerWeek(sets)
    expect(trend).toHaveLength(2)
    expect(trend[0]).toBeCloseTo(132.0, 4) // W18 first
    expect(trend[1]).toBeCloseTo(116.6667, 4) // W20 second
  })

  it('omits weeks with no qualifying set rather than padding with nulls', () => {
    const sets = [
      { weightKg: null, reps: 15, week: '2026-W19' }, // bodyweight, never qualifies
      { weightKg: 100, reps: 5, week: '2026-W20' }, // 116.67
    ]
    expect(bestE1rmPerWeek(sets)).toHaveLength(1)
    expect(bestE1rmPerWeek(sets)[0]).toBeCloseTo(116.6667, 4)
  })

  it('returns an empty array for an empty set list', () => {
    expect(bestE1rmPerWeek([])).toEqual([])
  })
})
