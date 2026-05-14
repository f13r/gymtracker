import { describe, it, expect } from 'vitest'
import { calculateStreak, calculateVolume } from './stats.utils.js'
import type { WorkoutSet } from './models.js'

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
