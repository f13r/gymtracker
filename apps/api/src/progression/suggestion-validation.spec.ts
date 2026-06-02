import { describe, it, expect } from 'vitest'

import { isPersistableSuggestion, type RawSuggestion } from './suggestion-validation'

const valid: RawSuggestion = {
  exerciseId: 'bench-id',
  suggestedSets: 3,
  suggestedReps: 8,
  suggestedWeightKg: 80,
  reason: 'progressive overload',
  evidence: ['last session 77.5kg×8'],
}

describe('isPersistableSuggestion', () => {
  it('accepts a bodyweight suggestion with suggestedWeightKg: 0', () => {
    expect(isPersistableSuggestion({ ...valid, suggestedWeightKg: 0 })).toBe(true)
  })

  it('accepts a fully-populated weighted suggestion', () => {
    expect(isPersistableSuggestion(valid)).toBe(true)
  })

  it('accepts 0 for sets and reps (present, not absent)', () => {
    expect(isPersistableSuggestion({ ...valid, suggestedSets: 0, suggestedReps: 0 })).toBe(true)
  })

  it.each([
    ['exerciseId', { exerciseId: null }],
    ['exerciseId (empty string)', { exerciseId: '' }],
    ['suggestedSets', { suggestedSets: null }],
    ['suggestedReps', { suggestedReps: undefined }],
    ['suggestedWeightKg', { suggestedWeightKg: null }],
    ['evidence', { evidence: null }],
  ])('rejects a suggestion missing %s', (_label, override) => {
    expect(isPersistableSuggestion({ ...valid, ...override })).toBe(false)
  })

  it('rejects a suggestion whose evidence array is empty', () => {
    expect(isPersistableSuggestion({ ...valid, evidence: [] })).toBe(false)
  })

  it('does not require reason', () => {
    expect(isPersistableSuggestion({ ...valid, reason: undefined })).toBe(true)
  })
})
