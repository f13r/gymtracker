import { describe, it, expect } from 'vitest'

import type { WorkoutSet } from './models.js'
import { calculateStreak, calculateVolume, computeExceededExercises } from './stats.utils.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000)
  return d.toISOString().split('T')[0]!
}

const today = daysAgo(0)
const yesterday = daysAgo(1)
const twoDaysAgo = daysAgo(2)
const threeDaysAgo = daysAgo(3)
const fourDaysAgo = daysAgo(4)

// ---------------------------------------------------------------------------
// calculateStreak
// ---------------------------------------------------------------------------

describe('calculateStreak', () => {
  it('returns { current: 0, longest: 0 } for empty array', () => {
    expect(calculateStreak([])).toEqual({ current: 0, longest: 0 })
  })

  it('single day = today → { current: 1, longest: 1 }', () => {
    expect(calculateStreak([today])).toEqual({ current: 1, longest: 1 })
  })

  it('single day = yesterday → { current: 1, longest: 1 }', () => {
    expect(calculateStreak([yesterday])).toEqual({ current: 1, longest: 1 })
  })

  it('single day = 2 days ago → { current: 0, longest: 1 }', () => {
    expect(calculateStreak([twoDaysAgo])).toEqual({ current: 0, longest: 1 })
  })

  it('consecutive days ending today → current equals number of days', () => {
    // today, yesterday, 2 days ago — sorted DESC
    const dates = [today, yesterday, twoDaysAgo]
    expect(calculateStreak(dates)).toEqual({ current: 3, longest: 3 })
  })

  it('consecutive days ending yesterday → current equals number of days', () => {
    const dates = [yesterday, twoDaysAgo, threeDaysAgo]
    expect(calculateStreak(dates)).toEqual({ current: 3, longest: 3 })
  })

  it('broken streak resets current to the leading sub-streak', () => {
    // today, yesterday — then a gap — then 4 days ago
    const dates = [today, yesterday, fourDaysAgo]
    // First two days form a streak of 2 (current).
    // fourDaysAgo starts a fresh streak of 1 → longest stays 2.
    expect(calculateStreak(dates)).toEqual({ current: 2, longest: 2 })
  })

  it('streak in the past is longer than the current one', () => {
    // Only today (streak 1 current), but 3-day streak further back
    const dates = [today, threeDaysAgo, fourDaysAgo, daysAgo(5)]
    // current = 1 (only today is contiguous from today/yesterday)
    // longest = 3 (threeDaysAgo→fourDaysAgo→5daysAgo consecutive)
    expect(calculateStreak(dates)).toEqual({ current: 1, longest: 3 })
  })

  it('fully broken: only a date well in the past → current 0, longest 1', () => {
    expect(calculateStreak([daysAgo(10)])).toEqual({ current: 0, longest: 1 })
  })
})

// ---------------------------------------------------------------------------
// calculateVolume
// ---------------------------------------------------------------------------

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'test-id',
    sessionId: 'test-session',
    exerciseId: 'test-exercise',
    setNumber: 1,
    reps: null,
    weightKg: null,
    durationSec: null,
    rpe: null,
    completedAt: 0,
    done: true,
    ...overrides,
  }
}

describe('calculateVolume', () => {
  it('returns 0 for empty array', () => {
    expect(calculateVolume([])).toBe(0)
  })

  it('treats null reps as 0', () => {
    expect(calculateVolume([makeSet({ reps: null, weightKg: 100 })])).toBe(0)
  })

  it('treats null weightKg as 0', () => {
    expect(calculateVolume([makeSet({ reps: 10, weightKg: null })])).toBe(0)
  })

  it('computes reps * weightKg for a single set', () => {
    expect(calculateVolume([makeSet({ reps: 10, weightKg: 60 })])).toBe(600)
  })

  it('sums across multiple sets', () => {
    const sets = [makeSet({ reps: 10, weightKg: 60 }), makeSet({ reps: 8, weightKg: 80 })]
    expect(calculateVolume(sets)).toBe(600 + 640) // 1240
  })

  it('handles mixed null and non-null values', () => {
    const sets = [
      makeSet({ reps: 10, weightKg: 50 }), // 500
      makeSet({ reps: null, weightKg: 50 }), // 0
      makeSet({ reps: 5, weightKg: null }), // 0
      makeSet({ reps: 3, weightKg: 100 }), // 300
    ]
    expect(calculateVolume(sets)).toBe(800)
  })
})

// ---------------------------------------------------------------------------
// computeExceededExercises
// ---------------------------------------------------------------------------

// 10 reps * 96kg = 960 volume (current symptom volume)
function set960(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return makeSet({ reps: 10, weightKg: 96, done: true, removedAt: null, ...overrides })
}
// 10 reps * 72kg = 720 volume (prior session volume)
function set720(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return makeSet({ reps: 10, weightKg: 72, done: true, removedAt: null, ...overrides })
}

describe('computeExceededExercises', () => {
  it('excludes an exercise absent from the previous session (original symptom)', () => {
    // Current: exercise A has 960kg of done volume. Prev: contains NO sets for A.
    const exercises = [{ id: 'A', name: 'Bench', loggedSets: [set960({ exerciseId: 'A' })] }]
    const prevSets = [set720({ exerciseId: 'B' })] // different exercise only
    const result = computeExceededExercises(exercises, prevSets)
    // A must be excluded: no prior done sets => no comparison.
    expect(result.find(e => e.id === 'A')).toBeUndefined()
    // Guard against regression: the naive session-level guard would have shown +960.
    expect(result).toEqual([])
  })

  it('excludes an exercise present in prev but with no DONE sets (present-but-skipped)', () => {
    // Prev contains sets for A but all are done:false and/or removedAt != null.
    const exercises = [{ id: 'A', name: 'Bench', loggedSets: [set960({ exerciseId: 'A' })] }]
    const prevSets = [
      set720({ exerciseId: 'A', done: false, removedAt: null }),
      set720({ exerciseId: 'A', done: true, removedAt: 123456 }),
    ]
    const result = computeExceededExercises(exercises, prevSets)
    // This MUST fail against a raw prevSets.filter(...).length > 0 guard.
    expect(result).toEqual([])
  })

  it('returns the true delta when prev has done sets and current exceeds it', () => {
    // Prev 720kg, current 960kg => delta 240, NOT 960.
    const exercises = [{ id: 'A', name: 'Bench', loggedSets: [set960({ exerciseId: 'A' })] }]
    const prevSets = [set720({ exerciseId: 'A' })]
    const result = computeExceededExercises(exercises, prevSets)
    expect(result).toEqual([{ id: 'A', name: 'Bench', delta: 240, currentVol: 960 }])
  })

  it('excludes an exercise when current <= prev', () => {
    // current 720, prev 960 => delta -240 => excluded
    const exercises = [{ id: 'A', name: 'Bench', loggedSets: [set720({ exerciseId: 'A' })] }]
    const prevSets = [set960({ exerciseId: 'A' })]
    expect(computeExceededExercises(exercises, prevSets)).toEqual([])
  })

  it('excludes an exercise with no current done sets (currentVol === 0)', () => {
    const exercises = [
      { id: 'A', name: 'Bench', loggedSets: [set960({ exerciseId: 'A', done: false })] },
    ]
    const prevSets = [set720({ exerciseId: 'A' })]
    expect(computeExceededExercises(exercises, prevSets)).toEqual([])
  })

  it('ignores not-done and removed sets in both current and previous volume', () => {
    // Current A: one done 960 set + one done-but-removed + one not-done => currentVol 960.
    // Prev A: one done 720 set + noise that must be ignored.
    const exercises = [
      {
        id: 'A',
        name: 'Bench',
        loggedSets: [
          set960({ exerciseId: 'A' }),
          set960({ exerciseId: 'A', removedAt: 999 }),
          set960({ exerciseId: 'A', done: false }),
        ],
      },
    ]
    const prevSets = [
      set720({ exerciseId: 'A' }),
      set720({ exerciseId: 'A', removedAt: 999 }),
      set720({ exerciseId: 'A', done: false }),
    ]
    // currentVol 960, prevExVol 720 => delta 240
    expect(computeExceededExercises(exercises, prevSets)).toEqual([
      { id: 'A', name: 'Bench', delta: 240, currentVol: 960 },
    ])
  })

  it('returns empty result when prevSets is empty', () => {
    const exercises = [{ id: 'A', name: 'Bench', loggedSets: [set960({ exerciseId: 'A' })] }]
    expect(computeExceededExercises(exercises, [])).toEqual([])
  })

  it('preserves input order across multiple exercises', () => {
    const exercises = [
      { id: 'A', name: 'Bench', loggedSets: [set960({ exerciseId: 'A' })] }, // 960 vs 720 => +240
      { id: 'B', name: 'Squat', loggedSets: [set960({ exerciseId: 'B' })] }, // 960 vs 720 => +240
    ]
    const prevSets = [set720({ exerciseId: 'B' }), set720({ exerciseId: 'A' })]
    const result = computeExceededExercises(exercises, prevSets)
    expect(result.map(e => e.id)).toEqual(['A', 'B'])
  })
})
