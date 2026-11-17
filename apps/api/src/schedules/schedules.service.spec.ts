import { NotFoundException } from '@nestjs/common'
import { describe, it, expect } from 'vitest'

import { SchedulesService } from './schedules.service'
import * as schema from '../drizzle/schema'
import { createFakeDb } from '../testing/fake-db'

// Two Users, u1 and u2. A Schedule may only point at the caller's own Template,
// and today's Schedule never reveals another User's Template (audit 3.2).
function setup() {
  const db = createFakeDb()
  db.seed(schema.workoutTemplates, { id: 't1', userId: 'u1', name: 'u1 Push' })
  db.seed(schema.templateExercises, { id: 'te1', templateId: 't1', exerciseId: 'e1', orderIndex: 0 })
  db.seed(schema.templateExercises, { id: 'te2', templateId: 't1', exerciseId: 'e2', orderIndex: 1 })
  return { db, svc: new SchedulesService(db as any) }
}

const today = new Date().toISOString().slice(0, 10)

describe('SchedulesService.createSchedule across Users', () => {
  it("rejects u2 scheduling u1's Template with 404 and writes nothing", async () => {
    const { db, svc } = setup()

    await expect(
      svc.createSchedule('u2', { templateId: 't1', type: 'once', scheduledDate: today }),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(db.rows(schema.workoutSchedules)).toEqual([])
  })

  it("lets u1 schedule u1's own Template", async () => {
    const { db, svc } = setup()

    await svc.createSchedule('u1', { templateId: 't1', type: 'once', scheduledDate: today })

    expect(db.rows(schema.workoutSchedules).map(r => [r.userId, r.templateId])).toEqual([['u1', 't1']])
  })
})

describe('SchedulesService.getTodaySchedule across Users', () => {
  it("shows u1's own Template name and exercise count", async () => {
    const { db, svc } = setup()
    db.seed(schema.workoutSchedules, { id: 's1', userId: 'u1', templateId: 't1', type: 'once', scheduledDate: today })

    const result = await svc.getTodaySchedule('u1')

    expect(result).toMatchObject({ templateName: 'u1 Push', exerciseCount: 2 })
  })

  it("never shows u1's Template to u2, even if u2's Schedule points at it", async () => {
    const { db, svc } = setup()
    // A Schedule created before ownership was checked: u2's row, u1's Template.
    db.seed(schema.workoutSchedules, { id: 's2', userId: 'u2', templateId: 't1', type: 'once', scheduledDate: today })

    const result = await svc.getTodaySchedule('u2')

    expect(result).toBeNull()
  })
})
