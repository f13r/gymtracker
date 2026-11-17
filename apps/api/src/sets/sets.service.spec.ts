import { BadRequestException } from '@nestjs/common'
import { describe, it, expect } from 'vitest'

import { SetsService } from './sets.service'
import * as schema from '../drizzle/schema'
import { createFakeDb } from '../testing/fake-db'

// A Session keeps logging the Archived Exercises its plan already holds, but a Set may not newly
// pick one (audit 3.4).
describe('SetsService.logSet and Archived Exercises', () => {
  function setup() {
    const db = createFakeDb()
    db.seed(schema.exercises, { id: 'live', name: 'Bench Press', archivedAt: null })
    db.seed(schema.exercises, { id: 'planned', name: 'Old Machine', archivedAt: 100 })
    db.seed(schema.exercises, { id: 'logged', name: 'Pec Deck', archivedAt: 100 })
    db.seed(schema.exercises, { id: 'gone', name: 'Smith Squat', archivedAt: 100 })
    db.seed(schema.sessionExercises, { id: 'se1', sessionId: 's1', exerciseId: 'planned', orderIndex: 0 })
    db.seed(schema.sets, { id: 'set0', sessionId: 's1', exerciseId: 'logged', setNumber: 1, done: 1 })
    // Another Session's plan does not make an Archived Exercise usable in s1.
    db.seed(schema.sessionExercises, { id: 'se2', sessionId: 's2', exerciseId: 'gone', orderIndex: 0 })
    const sessions = { assertActive: () => Promise.resolve({ id: 's1', finishedAt: null }) }
    const svc = new SetsService(db as any, sessions as any)
    return { db, svc }
  }

  it.each(['live', 'planned', 'logged'])('logs a Set for %s', async exerciseId => {
    const { svc } = setup()

    const set = await svc.logSet('s1', 'u1', { exerciseId, setNumber: 2, reps: 8, done: true })

    expect(set.exerciseId).toBe(exerciseId)
  })

  it('refuses a Set for an Archived Exercise the Session does not already use', async () => {
    const { db, svc } = setup()

    await expect(svc.logSet('s1', 'u1', { exerciseId: 'gone', setNumber: 1, done: false })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(db.rows(schema.sets)).toHaveLength(1)
  })
})
