import { describe, it, expect } from 'vitest'

import type { WorkoutSet } from './models.js'
import { isDoneSet, getDoneSets } from './set.utils.js'

describe('set.utils', () => {
  describe('isDoneSet', () => {
    it('returns true when done is true', () => {
      const set: WorkoutSet = {
        id: '1',
        sessionId: 'session1',
        exerciseId: 'exercise1',
        setNumber: 1,
        reps: 10,
        weightKg: 50,
        durationSec: null,
        rpe: null,
        completedAt: 1000,
        done: true,
      }
      expect(isDoneSet(set)).toBe(true)
    })

    it('returns false when done is false', () => {
      const set: WorkoutSet = {
        id: '2',
        sessionId: 'session1',
        exerciseId: 'exercise1',
        setNumber: 2,
        reps: null,
        weightKg: null,
        durationSec: null,
        rpe: null,
        completedAt: 1000,
        done: false,
      }
      expect(isDoneSet(set)).toBe(false)
    })

    it('returns false for a done Set that was later Removed', () => {
      const set: WorkoutSet = {
        id: '3',
        sessionId: 'session1',
        exerciseId: 'exercise1',
        setNumber: 3,
        reps: 10,
        weightKg: 50,
        durationSec: null,
        rpe: null,
        completedAt: 1000,
        done: true,
        removedAt: 2000,
      }
      expect(isDoneSet(set)).toBe(false)
    })
  })

  describe('getDoneSets', () => {
    it('returns empty array when input is empty', () => {
      expect(getDoneSets([])).toEqual([])
    })

    it('filters done sets from mixed array', () => {
      const sets: WorkoutSet[] = [
        {
          id: '1',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: true,
        },
        {
          id: '2',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 2,
          reps: null,
          weightKg: null,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: false,
        },
        {
          id: '3',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 3,
          reps: 12,
          weightKg: 52,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: true,
        },
      ]
      const result = getDoneSets(sets)
      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('1')
      expect(result[1]?.id).toBe('3')
    })

    it('returns all sets when all are done', () => {
      const sets: WorkoutSet[] = [
        {
          id: '1',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: true,
        },
        {
          id: '2',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 2,
          reps: 11,
          weightKg: 51,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: true,
        },
      ]
      const result = getDoneSets(sets)
      expect(result).toHaveLength(2)
      expect(result).toEqual(sets)
    })

    it('returns empty array when no sets are done', () => {
      const sets: WorkoutSet[] = [
        {
          id: '1',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 1,
          reps: null,
          weightKg: null,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: false,
        },
        {
          id: '2',
          sessionId: 'session1',
          exerciseId: 'exercise1',
          setNumber: 2,
          reps: null,
          weightKg: null,
          durationSec: null,
          rpe: null,
          completedAt: 1000,
          done: false,
        },
      ]
      const result = getDoneSets(sets)
      expect(result).toHaveLength(0)
    })
  })
})
