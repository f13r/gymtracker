import { describe, it, expect, vi } from 'vitest'

import type { ExerciseContext } from './exercise-history.service'
import { ProgressionService } from './progression.service'
import * as schema from '../drizzle/schema'
import { createFakeDb } from '../testing/fake-db'

const mockCoachingKnowledge = { retrieveForSituation: vi.fn().mockResolvedValue([]) }
const mockGemini = { generateStructured: vi.fn(), embed: vi.fn() }
const mockExerciseHistory = { buildExerciseContext: vi.fn() }
const service = new ProgressionService(
  {} as any,
  mockCoachingKnowledge as any,
  mockGemini as any,
  mockExerciseHistory as any,
)

/** A complete ExerciseContext; override only the fields a test cares about. */
function exCtx(overrides: Partial<ExerciseContext> = {}): ExerciseContext {
  return {
    exerciseId: 'bench-id',
    name: 'Bench Press',
    category: 'push',
    lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }],
    prWeightKg: 90,
    prReps: 3,
    weeklyVolumes: [],
    weeklyFrequency: 2,
    sessionCount: 5,
    lastTwoSessions: [],
    categoryWeeklySetCount: 10,
    hoursSinceCategorySession: null,
    consecutiveWeeksActive: 4,
    currentE1rmKg: null,
    e1rmTrend: [],
    ...overrides,
  }
}

const noProfile = {
  age: null,
  heightCm: null,
  experienceLevel: null,
  latestBodyWeightKg: null,
  goal: null,
  trainingPhase: null,
}

describe('ProgressionService.buildPrompt', () => {
  it('includes exercise block with id, name, and session sets', () => {
    const result = service.buildPrompt([exCtx({ weeklyVolumes: [{ week: '2026-W20', volume: 1920 }] })], {
      ...noProfile,
      age: 32,
      heightCm: 180,
      experienceLevel: 'intermediate',
      latestBodyWeightKg: 82,
    })
    expect(result).toContain('[bench-id] Bench Press (push)')
    expect(result).toContain('set1 80kg×8')
    expect(result).toContain('PR: 90kg × 3 reps')
    expect(result).toContain('4-week volume: 1920kg')
    expect(result).toContain('Age: 32')
  })

  it('shows "insufficient data" when no weekly volumes', () => {
    const result = service.buildPrompt(
      [
        exCtx({
          exerciseId: 'squat-id',
          name: 'Squat',
          category: 'legs',
          lastSets: [],
          prWeightKg: null,
          prReps: null,
          weeklyFrequency: 1,
          sessionCount: 1,
          categoryWeeklySetCount: 0,
          consecutiveWeeksActive: 1,
        }),
      ],
      noProfile,
    )
    expect(result).toContain('4-week volume: insufficient data')
    expect(result).toContain('PR: none recorded')
    expect(result).toContain('No profile data available')
  })
})

describe('ProgressionService.buildSituationSummary', () => {
  it('includes experience level, goal, training phase, and body weight', () => {
    const result = service.buildSituationSummary([], {
      experienceLevel: 'intermediate',
      latestBodyWeightKg: 82,
      goal: 'hypertrophy',
      trainingPhase: 'accumulation',
    })
    expect(result).toContain('intermediate')
    expect(result).toContain('82kg')
    expect(result).toContain('hypertrophy')
    expect(result).toContain('accumulation')
  })

  it('includes exercise name, volume trend, session count, and category session gap', () => {
    const result = service.buildSituationSummary(
      [
        exCtx({
          lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: 7 }],
          weeklyVolumes: [
            { week: '2026-W19', volume: 1800 },
            { week: '2026-W20', volume: 1920 },
          ],
          weeklyFrequency: 3,
          lastTwoSessions: [
            { weightKg: 80, reps: 10 },
            { weightKg: 80, reps: 11 },
          ],
          categoryWeeklySetCount: 12,
          hoursSinceCategorySession: 72,
          consecutiveWeeksActive: 6,
        }),
      ],
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

describe('ProgressionService e1RM signal', () => {
  it('includes current e1RM and a 4-week e1RM trend in the prompt', () => {
    const result = service.buildPrompt([exCtx({ currentE1rmKg: 132, e1rmTrend: [116.6667, 132] })], noProfile)
    expect(result).toContain('Estimated 1RM: 132kg')
    expect(result).toContain('117 → 132kg')
    // prompt permits citing e1RM in plain-language evidence
    expect(result.toLowerCase()).toContain('1-rep max')
  })

  it('emits no e1RM output for an exercise with no qualifying sets', () => {
    const result = service.buildPrompt(
      [
        exCtx({
          exerciseId: 'plank-id',
          name: 'Plank',
          category: 'core',
          lastSets: [],
          prWeightKg: null,
          prReps: null,
          weeklyFrequency: 1,
          sessionCount: 2,
          categoryWeeklySetCount: 0,
          consecutiveWeeksActive: 1,
          currentE1rmKg: null,
          e1rmTrend: [],
        }),
      ],
      noProfile,
    )
    expect(result).not.toContain('Estimated 1RM')
  })

  it('includes e1RM in the situation summary', () => {
    const result = service.buildSituationSummary(
      [
        exCtx({
          lastSets: [{ setNumber: 1, weightKg: 80, reps: 8, rpe: 7 }],
          weeklyFrequency: 3,
          categoryWeeklySetCount: 12,
          hoursSinceCategorySession: 72,
          consecutiveWeeksActive: 6,
          currentE1rmKg: 132,
          e1rmTrend: [116.6667, 132],
        }),
      ],
      { experienceLevel: null, latestBodyWeightKg: null, goal: null, trainingPhase: null },
    )
    expect(result).toContain('e1RM 132kg')
  })
})

describe('ProgressionService.buildPrompt with coaching chunks', () => {
  it('includes COACHING PRINCIPLES section when chunks are provided', () => {
    const result = service.buildPrompt(
      [exCtx({ sessionCount: 4, categoryWeeklySetCount: 8, consecutiveWeeksActive: 3 })],
      { ...noProfile, experienceLevel: 'intermediate', goal: 'hypertrophy', trainingPhase: 'accumulation' },
      ['Intermediate lifters progress weekly.', 'RPE target is 7–8.'],
    )
    expect(result).toContain('COACHING PRINCIPLES')
    expect(result).toContain('Intermediate lifters progress weekly.')
    expect(result).toContain('RPE target is 7–8.')
  })

  it('omits COACHING PRINCIPLES section when no chunks provided', () => {
    const result = service.buildPrompt(
      [
        exCtx({
          exerciseId: 'squat-id',
          name: 'Squat',
          category: 'legs',
          lastSets: [],
          prWeightKg: null,
          prReps: null,
          weeklyFrequency: 1,
          sessionCount: 1,
          categoryWeeklySetCount: 0,
          consecutiveWeeksActive: 1,
        }),
      ],
      noProfile,
      [],
    )
    expect(result).not.toContain('COACHING PRINCIPLES')
  })
})

// With a shared Exercise library any real Exercise id passes the FK, so a
// hallucinated id must not become a Suggestion for an Exercise the Session
// never trained (audit 3.7).
describe('ProgressionService.generateForSession keeps only trained Exercises', () => {
  it('persists suggestions only for Exercises with done Sets in the Session', async () => {
    const db = createFakeDb()
    db.seed(schema.sets, { id: 'set1', sessionId: 's1', exerciseId: 'bench-id', done: 1 })
    const suggestion = (exerciseId: string) => ({
      exerciseId,
      suggestedSets: 3,
      suggestedReps: 8,
      suggestedWeightKg: 82.5,
      reason: 'two-for-two',
      evidence: ['8/8 at 80 kg'],
    })
    const gemini = {
      generateStructured: vi.fn().mockResolvedValue({
        suggestions: [suggestion('bench-id'), suggestion('squat-id')],
      }),
    }
    const history = { buildExerciseContext: vi.fn().mockResolvedValue(exCtx()) }
    const svc = new ProgressionService(db as any, mockCoachingKnowledge as any, gemini as any, history as any)

    await svc.generateForSession('s1', 'u1')

    expect(db.rows(schema.progressionSuggestions).map(r => [r.userId, r.exerciseId])).toEqual([['u1', 'bench-id']])
  })
})
