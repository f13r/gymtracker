import { describe, it, expect } from 'vitest'

import { resolvePrepopulatedSet, FALLBACK_WEIGHT_KG, FALLBACK_REPS } from './set-prepopulation.js'

describe('resolvePrepopulatedSet', () => {
  describe('full hierarchy precedence — weight', () => {
    it('prefers progression over lastDone and template', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: 100, suggestedReps: 5 },
        lastDoneSet: { weightKg: 90, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(100)
      expect(result.weightSource).toBe('progression')
    })

    it('falls back to lastDone when progression weight is absent', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: null, suggestedReps: 5 },
        lastDoneSet: { weightKg: 90, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(90)
      expect(result.weightSource).toBe('lastDone')
    })

    it('falls back to template when progression and lastDone weight are absent', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: null },
        lastDoneSet: { weightKg: undefined },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(80)
      expect(result.weightSource).toBe('template')
    })
  })

  describe('full hierarchy precedence — reps', () => {
    it('prefers progression over lastDone and template', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: 100, suggestedReps: 5 },
        lastDoneSet: { weightKg: 90, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.reps).toBe(5)
      expect(result.repsSource).toBe('progression')
    })

    it('falls back to lastDone when progression reps is absent', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: 100, suggestedReps: null },
        lastDoneSet: { weightKg: 90, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.reps).toBe(6)
      expect(result.repsSource).toBe('lastDone')
    })

    it('falls back to template when progression and lastDone reps are absent', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedReps: undefined },
        lastDoneSet: { reps: null },
        templateDefault: { defaultWeightKg: 80, defaultReps: 12 },
      })
      expect(result.reps).toBe(12)
      expect(result.repsSource).toBe('template')
    })
  })

  describe('0 is a real value, not absent', () => {
    it('uses a 0kg bodyweight set from lastDone instead of skipping to template', () => {
      const result = resolvePrepopulatedSet({
        lastDoneSet: { weightKg: 0, reps: 12 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(0)
      expect(result.weightSource).toBe('lastDone')
    })

    it('uses a 0kg progression suggestion instead of skipping', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: 0, suggestedReps: 10 },
        lastDoneSet: { weightKg: 90, reps: 6 },
      })
      expect(result.weightKg).toBe(0)
      expect(result.weightSource).toBe('progression')
    })

    it('treats 0 reps as a real value', () => {
      const result = resolvePrepopulatedSet({
        lastDoneSet: { weightKg: 50, reps: 0 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.reps).toBe(0)
      expect(result.repsSource).toBe('lastDone')
    })
  })

  describe('mixed sources — weight and reps resolve independently', () => {
    it('takes weight from progression but reps from lastDone', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: 100, suggestedReps: null },
        lastDoneSet: { weightKg: 90, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(100)
      expect(result.weightSource).toBe('progression')
      expect(result.reps).toBe(6)
      expect(result.repsSource).toBe('lastDone')
    })

    it('takes weight from lastDone but reps from progression', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: null, suggestedReps: 5 },
        lastDoneSet: { weightKg: 90, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(90)
      expect(result.weightSource).toBe('lastDone')
      expect(result.reps).toBe(5)
      expect(result.repsSource).toBe('progression')
    })

    it('takes weight from template but reps from lastDone', () => {
      const result = resolvePrepopulatedSet({
        lastDoneSet: { weightKg: null, reps: 6 },
        templateDefault: { defaultWeightKg: 80, defaultReps: 8 },
      })
      expect(result.weightKg).toBe(80)
      expect(result.weightSource).toBe('template')
      expect(result.reps).toBe(6)
      expect(result.repsSource).toBe('lastDone')
    })
  })

  describe('all-absent fallback', () => {
    it('uses hardcoded fallbacks for empty inputs', () => {
      const result = resolvePrepopulatedSet({})
      expect(result.weightKg).toBe(FALLBACK_WEIGHT_KG)
      expect(result.reps).toBe(FALLBACK_REPS)
      expect(result.weightSource).toBe('fallback')
      expect(result.repsSource).toBe('fallback')
    })

    it('uses the exact fallback constants 0 and 8', () => {
      const result = resolvePrepopulatedSet({})
      expect(result.weightKg).toBe(0)
      expect(result.reps).toBe(8)
    })

    it('uses fallbacks when all sources are explicitly null', () => {
      const result = resolvePrepopulatedSet({
        progression: null,
        lastDoneSet: null,
        templateDefault: null,
      })
      expect(result.weightSource).toBe('fallback')
      expect(result.repsSource).toBe('fallback')
    })

    it('uses fallbacks when every field within every source is null/undefined', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: null, suggestedReps: undefined },
        lastDoneSet: { weightKg: undefined, reps: null },
        templateDefault: { defaultWeightKg: null, defaultReps: null },
      })
      expect(result.weightKg).toBe(0)
      expect(result.weightSource).toBe('fallback')
      expect(result.reps).toBe(8)
      expect(result.repsSource).toBe('fallback')
    })
  })

  describe('partial null fields within a source', () => {
    it('skips a source whose specific field is null but uses it for the present field', () => {
      // progression has reps but no weight; weight should walk down to lastDone
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: null, suggestedReps: 4 },
        lastDoneSet: { weightKg: 70, reps: 9 },
      })
      expect(result.weightKg).toBe(70)
      expect(result.weightSource).toBe('lastDone')
      expect(result.reps).toBe(4)
      expect(result.repsSource).toBe('progression')
    })

    it('handles a source object with one field undefined (omitted)', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedReps: 3 },
        lastDoneSet: { weightKg: 60 },
      })
      expect(result.weightKg).toBe(60)
      expect(result.weightSource).toBe('lastDone')
      expect(result.reps).toBe(3)
      expect(result.repsSource).toBe('progression')
    })

    it('falls through multiple sources for one field while another resolves immediately', () => {
      const result = resolvePrepopulatedSet({
        progression: { suggestedWeightKg: 120, suggestedReps: null },
        lastDoneSet: { weightKg: null, reps: null },
        templateDefault: { defaultWeightKg: null, defaultReps: 10 },
      })
      expect(result.weightKg).toBe(120)
      expect(result.weightSource).toBe('progression')
      expect(result.reps).toBe(10)
      expect(result.repsSource).toBe('template')
    })
  })
})
