import { describe, it, expect } from 'vitest'
import { ProgressionService } from './progression.service'

// Minimal mocks — buildPrompt doesn't use db or config
const service = new ProgressionService(
  {} as any,
  { getOrThrow: () => 'fake-key' } as any,
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
      }],
      { age: 32, heightCm: 180, experienceLevel: 'intermediate', latestBodyWeightKg: 82 },
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
      }],
      { age: null, heightCm: null, experienceLevel: null, latestBodyWeightKg: null },
    )
    expect(result).toContain('4-week volume: insufficient data')
    expect(result).toContain('PR: none recorded')
    expect(result).toContain('No profile data available')
  })
})
