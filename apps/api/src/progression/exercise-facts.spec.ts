import { describe, it, expect } from 'vitest'

import { formatExerciseFacts } from './exercise-facts'
import type { ExerciseContext } from './exercise-history.service'

function ctx(overrides: Partial<ExerciseContext> = {}): ExerciseContext {
  return {
    exerciseId: 'bench-id',
    name: 'Bench Press',
    category: 'push',
    lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: 7 }],
    prWeightKg: 90,
    prReps: 3,
    weeklyVolumes: [
      { week: '2026-W19', volume: 1800 },
      { week: '2026-W20', volume: 1920 },
    ],
    weeklyFrequency: 3,
    sessionCount: 5,
    lastTwoSessions: [
      { weightKg: 80, reps: 10 },
      { weightKg: 80, reps: 11 },
    ],
    categoryWeeklySetCount: 12,
    hoursSinceCategorySession: 72,
    consecutiveWeeksActive: 6,
    currentE1rmKg: 132,
    e1rmTrend: [116.6667, 132],
    ...overrides,
  }
}

describe('formatExerciseFacts', () => {
  it('formats name with category and the last done set', () => {
    const f = formatExerciseFacts(ctx())
    expect(f.nameWithCategory).toBe('Bench Press (push)')
    expect(f.lastSet).toBe('80kg×8 @RPE7')
  })

  it('omits the category suffix and RPE when absent', () => {
    const f = formatExerciseFacts(
      ctx({ category: null, lastSets: [{ setNumber: 1, weightKg: 60, reps: 5, rpe: null }] }),
    )
    expect(f.nameWithCategory).toBe('Bench Press')
    expect(f.lastSet).toBe('60kg×5')
  })

  it('joins all done sets this session with their set numbers', () => {
    const f = formatExerciseFacts(
      ctx({
        lastSets: [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 7 },
          { setNumber: 2, weightKg: 80, reps: 6, rpe: null },
        ],
      }),
    )
    expect(f.sessionSets).toBe('set1 80kg×8 @RPE7, set2 80kg×6')
  })

  it('reports no last set and no session sets when none are done', () => {
    const f = formatExerciseFacts(ctx({ lastSets: [] }))
    expect(f.lastSet).toBeNull()
    expect(f.sessionSets).toBeNull()
  })

  it('formats two-for-two top sets when two prior sessions exist', () => {
    const f = formatExerciseFacts(ctx())
    expect(f.twoForTwoTopSets).toBe('80kg×10, 80kg×11')
  })

  it('returns null two-for-two when fewer than two prior sessions', () => {
    const f = formatExerciseFacts(ctx({ lastTwoSessions: [{ weightKg: 80, reps: 10 }] }))
    expect(f.twoForTwoTopSets).toBeNull()
  })

  it('reports an increasing volume trend and renders the series', () => {
    const f = formatExerciseFacts(ctx())
    expect(f.volumeTrend).toBe('increasing')
    expect(f.volumeSeries).toBe('1800kg → 1920kg')
  })

  it('reports a flat-or-decreasing volume trend', () => {
    const f = formatExerciseFacts(
      ctx({
        weeklyVolumes: [
          { week: '2026-W19', volume: 1920 },
          { week: '2026-W20', volume: 1800 },
        ],
      }),
    )
    expect(f.volumeTrend).toBe('flat or decreasing')
  })

  it('reports insufficient volume data with fewer than two weeks', () => {
    const single = formatExerciseFacts(ctx({ weeklyVolumes: [{ week: '2026-W20', volume: 1920 }] }))
    expect(single.volumeTrend).toBe('insufficient data')
    expect(single.volumeSeries).toBe('1920kg')

    const none = formatExerciseFacts(ctx({ weeklyVolumes: [] }))
    expect(none.volumeTrend).toBe('insufficient data')
    expect(none.volumeSeries).toBeNull()
  })

  it('rounds the current e1RM and renders the populated-week trend', () => {
    const f = formatExerciseFacts(ctx())
    expect(f.e1rmCurrent).toBe(132)
    expect(f.e1rmTrend).toBe('117 → 132kg')
  })

  it('emits no e1RM facts when there is no qualifying e1RM', () => {
    const f = formatExerciseFacts(ctx({ currentE1rmKg: null, e1rmTrend: [] }))
    expect(f.e1rmCurrent).toBeNull()
    expect(f.e1rmTrend).toBeNull()
  })
})
