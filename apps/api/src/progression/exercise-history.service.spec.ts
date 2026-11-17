import { describe, it, expect } from 'vitest'

import { ExerciseHistoryService } from './exercise-history.service'
import * as schema from '../drizzle/schema'
import { createFakeDb } from '../testing/fake-db'

// Two Users, u1 and u2. The "current session" Sets come only from the caller's
// own Session, even if a foreign Session id reaches this service (audit 3.6).
describe('ExerciseHistoryService.buildExerciseContext across Users', () => {
  function setup() {
    const db = createFakeDb()
    db.seed(schema.exercises, { id: 'e1', name: 'Bench Press', category: 'push' })
    db.seed(
      schema.sets,
      { id: 'set1', sessionId: 's1', exerciseId: 'e1', setNumber: 1, weightKg: 80, reps: 8, rpe: null, done: 1 },
      { 'workout_sessions.user_id': 'u1' },
    )
    return new ExerciseHistoryService(db as any)
  }

  it("includes u1's own Session Sets for u1", async () => {
    const ctx = await setup().buildExerciseContext('e1', 'u1', 's1')

    expect(ctx?.lastSets).toEqual([{ setNumber: 1, weightKg: 80, reps: 8, rpe: null }])
  })

  it("never includes u1's Session Sets for u2", async () => {
    const ctx = await setup().buildExerciseContext('e1', 'u2', 's1')

    expect(ctx?.lastSets).toEqual([])
  })
})
