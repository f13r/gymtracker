import { describe, it, expect, vi } from 'vitest'
import { ProgressionService } from './progression.service'

const mockCoachingKnowledge = { retrieveForSituation: vi.fn().mockResolvedValue([]) }
const service = new ProgressionService(
  {} as any,
  { getOrThrow: () => 'fake-key' } as any,
  mockCoachingKnowledge as any,
)

describe('ProgressionService.buildPrompt', () => {
  it('includes exercise block with id, name, and session sets', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'bench-id',
        name: 'Bench Press',
        category: 'push',
        lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }],
        prWeightKg: 90,
        prReps: 3,
        weeklyVolumes: [{ week: '2026-W20', volume: 1920 }],
        weeklyFrequency: 2,
        sessionCount: 5,
        lastTwoSessions: [],
        categoryWeeklySetCount: 10,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 4,
      }],
      { age: 32, heightCm: 180, experienceLevel: 'intermediate', latestBodyWeightKg: 82, goal: null, trainingPhase: null },
    )
    expect(result).toContain('[bench-id] Bench Press (push)')
    expect(result).toContain('set1 80kg×8')
    expect(result).toContain('PR: 90kg × 3 reps')
    expect(result).toContain('4-week volume: 1920kg')
    expect(result).toContain('Age: 32')
  })

  it('shows "insufficient data" when no weekly volumes', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'squat-id',
        name: 'Squat',
        category: 'legs',
        lastSets: [],
        prWeightKg: null,
        prReps: null,
        weeklyVolumes: [],
        weeklyFrequency: 1,
        sessionCount: 1,
        lastTwoSessions: [],
        categoryWeeklySetCount: 0,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 1,
      }],
      { age: null, heightCm: null, experienceLevel: null, latestBodyWeightKg: null, goal: null, trainingPhase: null },
    )
    expect(result).toContain('4-week volume: insufficient data')
    expect(result).toContain('PR: none recorded')
    expect(result).toContain('No profile data available')
  })
})

describe('ProgressionService.buildSituationSummary', () => {
  it('includes experience level, goal, training phase, and body weight', () => {
    const result = service.buildSituationSummary(
      [],
      { experienceLevel: 'intermediate', latestBodyWeightKg: 82, goal: 'hypertrophy', trainingPhase: 'accumulation' },
    )
    expect(result).toContain('intermediate')
    expect(result).toContain('82kg')
    expect(result).toContain('hypertrophy')
    expect(result).toContain('accumulation')
  })

  it('includes exercise name, volume trend, session count, and category session gap', () => {
    const result = service.buildSituationSummary(
      [{
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
        lastTwoSessions: [{ weightKg: 80, reps: 10 }, { weightKg: 80, reps: 11 }],
        categoryWeeklySetCount: 12,
        hoursSinceCategorySession: 72,
        consecutiveWeeksActive: 6,
      }],
      { experienceLevel: null, latestBodyWeightKg: null, goal: null, trainingPhase: null },
    )
    expect(result).toContain('Bench Press')
    expect(result).toContain('increasing')
    expect(result).toContain('PR: 90kg')
    expect(result).toContain('5 sessions')
    expect(result).toContain('12 sets/week')
    expect(result).toContain('72h since')
    expect(result).toContain('6 weeks')
  })
})

describe('ProgressionService.buildPrompt with coaching chunks', () => {
  it('includes COACHING PRINCIPLES section when chunks are provided', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'bench-id',
        name: 'Bench Press',
        category: 'push',
        lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }],
        prWeightKg: 90,
        prReps: 3,
        weeklyVolumes: [],
        weeklyFrequency: 2,
        sessionCount: 4,
        lastTwoSessions: [],
        categoryWeeklySetCount: 8,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 3,
      }],
      { age: null, heightCm: null, experienceLevel: 'intermediate', latestBodyWeightKg: null, goal: 'hypertrophy', trainingPhase: 'accumulation' },
      ['Intermediate lifters progress weekly.', 'RPE target is 7–8.'],
    )
    expect(result).toContain('COACHING PRINCIPLES')
    expect(result).toContain('Intermediate lifters progress weekly.')
    expect(result).toContain('RPE target is 7–8.')
  })

  it('omits COACHING PRINCIPLES section when no chunks provided', () => {
    const result = service.buildPrompt(
      [{
        exerciseId: 'squat-id',
        name: 'Squat',
        category: 'legs',
        lastSets: [],
        prWeightKg: null,
        prReps: null,
        weeklyVolumes: [],
        weeklyFrequency: 1,
        sessionCount: 1,
        lastTwoSessions: [],
        categoryWeeklySetCount: 0,
        hoursSinceCategorySession: null,
        consecutiveWeeksActive: 1,
      }],
      { age: null, heightCm: null, experienceLevel: null, latestBodyWeightKg: null, goal: null, trainingPhase: null },
      [],
    )
    expect(result).not.toContain('COACHING PRINCIPLES')
  })
})
