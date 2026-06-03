import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProgramService } from './program.service'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  execute: vi.fn(),
}
const mockGemini = { generateStructured: vi.fn(), embed: vi.fn() }
const mockCoaching = { retrieveForSituation: vi.fn().mockResolvedValue([]) }

describe('ProgramService.buildGenerationPrompt', () => {
  it('includes experience level, goal, training days, and session duration', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const prompt = svc.buildGenerationPrompt(
      {
        experienceLevel: 'beginner',
        goal: 'hypertrophy',
        trainingDays: ['monday', 'wednesday', 'friday'],
        sessionDurationMinutes: 60,
        latestBodyWeightKg: 75,
      },
      [
        { id: 'squat-id', name: 'Squat', category: 'legs' },
        { id: 'bench-id', name: 'Bench Press', category: 'push' },
      ],
      ['Novice lifters adapt session-to-session.'],
    )
    expect(prompt).toContain('beginner')
    expect(prompt).toContain('hypertrophy')
    expect(prompt).toContain('monday')
    expect(prompt).toContain('60 minutes')
    expect(prompt).toContain('75kg')
    expect(prompt).toContain('Squat')
    expect(prompt).toContain('Novice lifters adapt session-to-session.')
  })

  it('includes age, height, and a recent-training section when provided', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const prompt = svc.buildGenerationPrompt(
      {
        experienceLevel: 'intermediate',
        goal: 'strength',
        trainingDays: ['monday', 'thursday'],
        sessionDurationMinutes: 75,
        latestBodyWeightKg: 82,
        age: 30,
        heightCm: 180,
      },
      [{ id: 'x', name: 'Жим лежаче, штанга', category: 'push' }],
      [],
      '- Жим лежаче, штанга (push): 12 sessions, best 80kg×5, ~90kg e1RM, latest 75kg×8',
    )
    expect(prompt).toContain('Age: 30')
    expect(prompt).toContain('Height: 180cm')
    expect(prompt).toContain('YOUR RECENT TRAINING')
    expect(prompt).toContain('Жим лежаче, штанга (push): 12 sessions')
  })

  it('omits the recent-training section when there is no history', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const prompt = svc.buildGenerationPrompt(
      {
        experienceLevel: 'beginner',
        goal: 'hypertrophy',
        trainingDays: ['monday'],
        sessionDurationMinutes: 60,
        latestBodyWeightKg: null,
      },
      [],
      [],
      '',
    )
    expect(prompt).not.toContain('YOUR RECENT TRAINING')
  })

  it('includes JSON output format instructions', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const prompt = svc.buildGenerationPrompt(
      {
        experienceLevel: 'beginner',
        goal: 'strength',
        trainingDays: ['tuesday', 'thursday'],
        sessionDurationMinutes: 45,
        latestBodyWeightKg: null,
      },
      [],
      [],
    )
    expect(prompt).toContain('phases')
    expect(prompt).toContain('targetSessionCount')
    expect(prompt).toContain('splitType')
  })
})

describe('ProgramService.parseGeminiProgram', () => {
  it('parses valid AI response into Program structure', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const raw = {
      name: 'My 16-Week Journey',
      phases: [
        {
          name: 'Building Your Base',
          type: 'accumulation',
          durationWeeks: 8,
          splitType: 'full_body',
          rationale: 'Beginners need full-body frequency.',
          templates: [
            {
              name: 'Full Body A',
              dayLabel: 'A',
              exercises: [
                { exerciseId: 'squat-id', orderIndex: 0, defaultSets: 3, defaultReps: 8, defaultWeightKg: 40 },
              ],
            },
          ],
        },
      ],
    }
    const result = svc.parseGeminiProgram(raw, 3, new Set(['squat-id']))
    expect(result.name).toBe('My 16-Week Journey')
    expect(result.phases).toHaveLength(1)
    expect(result.phases[0]?.targetSessionCount).toBe(24) // 3 days/week × 8 weeks
    expect(result.phases[0]?.type).toBe('accumulation')
  })

  it('throws on missing required fields', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    expect(() => svc.parseGeminiProgram({ phases: [] }, 3, new Set())).toThrow()
  })

  it('throws on an off-vocabulary phase type', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const raw = {
      name: 'Bad Program',
      phases: [
        {
          name: 'Phase',
          type: 'hypertrophy', // not in PhaseTypeSchema enum
          durationWeeks: 8,
          splitType: 'full_body',
          rationale: '',
          templates: [
            {
              name: 'A',
              dayLabel: 'A',
              exercises: [{ exerciseId: 'squat-id', orderIndex: 0, defaultSets: 3, defaultReps: 8, defaultWeightKg: 40 }],
            },
          ],
        },
      ],
    }
    expect(() => svc.parseGeminiProgram(raw, 3, new Set(['squat-id']))).toThrow()
  })

  it('throws when an exerciseId is not in the available library', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const raw = {
      name: 'Hallucinated Program',
      phases: [
        {
          name: 'Phase',
          type: 'accumulation',
          durationWeeks: 8,
          splitType: 'full_body',
          rationale: '',
          templates: [
            {
              name: 'A',
              dayLabel: 'A',
              exercises: [{ exerciseId: 'made-up-id', orderIndex: 0, defaultSets: 3, defaultReps: 8, defaultWeightKg: 40 }],
            },
          ],
        },
      ],
    }
    expect(() => svc.parseGeminiProgram(raw, 3, new Set(['squat-id']))).toThrow(/unknown exercise/i)
  })
})

describe('ProgramService.buildAdaptationPrompt', () => {
  it('includes current phase type, session count, and performance signals', () => {
    const svc = new ProgramService(mockDb as any, mockGemini as any, mockCoaching as any)
    const prompt = svc.buildAdaptationPrompt(
      {
        id: 'phase-1',
        name: 'Building Your Base',
        type: 'accumulation',
        targetSessionCount: 24,
        completedSessionCount: 20,
        splitType: 'full_body',
        rationale: '',
        orderIndex: 0,
        status: 'active',
        programId: 'prog-1',
        templates: [],
      },
      {
        volumePlateau: true,
        averageRpe: 9.1,
        consecutiveWeeksSinceProgress: 3,
        isLastPhase: false,
      },
      ['Volume plateau means MRV is breached.'],
    )
    expect(prompt).toContain('accumulation')
    expect(prompt).toContain('20')
    expect(prompt).toContain('24')
    expect(prompt).toContain('RPE')
    expect(prompt).toContain('Volume plateau means MRV is breached.')
  })
})

describe('ProgramService.abandonActiveProgram', () => {
  it('marks the active program abandoned and clears the weekly schedule', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn(() => ({ where: updateWhere }))
    const update = vi.fn(() => ({ set: updateSet }))
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const del = vi.fn(() => ({ where: deleteWhere }))

    const db = { update, delete: del }
    const svc = new ProgramService(db as any, mockGemini as any, mockCoaching as any)

    await svc.abandonActiveProgram('user-1')

    expect(updateSet).toHaveBeenCalledWith({ status: 'abandoned' })
    expect(update).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledTimes(1)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
  })
})
