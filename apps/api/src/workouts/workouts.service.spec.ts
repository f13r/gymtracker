import { describe, it, expect, vi, beforeEach } from 'vitest'

import { WorkoutsService } from './workouts.service'
import * as schema from '../drizzle/schema'

describe('WorkoutsService.deleteTemplate', () => {
  let deletedTables: unknown[]
  let mockDb: any

  beforeEach(() => {
    deletedTables = []
    mockDb = {
      // getTemplate(): select the template row, then its exercises
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ id: 't1', userId: 'u1', name: 'Full Body A' }])),
            then: (resolve: (v: unknown[]) => unknown) => resolve([]),
          })),
        })),
      })),
      delete: vi.fn((table: unknown) => {
        deletedTables.push(table)
        return { where: vi.fn(() => Promise.resolve()) }
      }),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    }
  })

  it('removes program_phase_templates links so an FK constraint cannot block the delete', async () => {
    const svc = new WorkoutsService(mockDb, {} as any, {} as any, {} as any)

    await svc.deleteTemplate('t1', 'u1')

    // The NOT NULL FK program_phase_templates.template_id must be cleared first,
    // otherwise deleting the template raises a foreign-key violation (500).
    expect(deletedTables).toContain(schema.programPhaseTemplates)
    expect(deletedTables).toContain(schema.workoutTemplates)
    expect(deletedTables.indexOf(schema.programPhaseTemplates)).toBeLessThan(
      deletedTables.indexOf(schema.workoutTemplates),
    )
  })
})

describe('WorkoutsService.updateTemplate', () => {
  let deletedTables: unknown[]
  let insertedTables: unknown[]
  let mockDb: any

  beforeEach(() => {
    deletedTables = []
    insertedTables = []
    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ id: 't1', userId: 'u1', name: 'Full Body A' }])),
            then: (resolve: (v: unknown[]) => unknown) => resolve([]),
          })),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      delete: vi.fn((table: unknown) => {
        deletedTables.push(table)
        return { where: vi.fn(() => Promise.resolve()) }
      }),
      insert: vi.fn((table: unknown) => {
        insertedTables.push(table)
        return { values: vi.fn(() => Promise.resolve()) }
      }),
    }
  })

  it('mutates the template in place — replaces exercises but never deletes the template row', async () => {
    const svc = new WorkoutsService(mockDb, {} as any, {} as any, {} as any)

    await svc.updateTemplate('t1', 'u1', {
      name: 'Full Body A (edited)',
      exercises: [{ exerciseId: 'e1', orderIndex: 0, defaultSets: 3, defaultReps: 8 }],
    })

    // The exercises are full-replaced...
    expect(deletedTables).toContain(schema.templateExercises)
    expect(insertedTables).toContain(schema.templateExercises)
    // ...but the workout_templates row keeps its id, so Schedule/Session templateId references stay intact.
    expect(deletedTables).not.toContain(schema.workoutTemplates)
  })

  it('persists supersetGroup from the DTO onto template_exercises (null for standalone)', async () => {
    const insertedValues: any[] = []
    mockDb.insert = vi.fn((table: unknown) => {
      insertedTables.push(table)
      return {
        values: vi.fn((v: unknown) => {
          if (table === schema.templateExercises) {
            insertedValues.push(v)
          }
          return Promise.resolve()
        }),
      }
    })
    const svc = new WorkoutsService(mockDb, {} as any, {} as any, {} as any)

    await svc.updateTemplate('t1', 'u1', {
      name: 'Superset day',
      exercises: [
        { exerciseId: 'e1', orderIndex: 0, supersetGroup: 'g1' },
        { exerciseId: 'e2', orderIndex: 1, supersetGroup: 'g1' },
        { exerciseId: 'e3', orderIndex: 2 },
      ],
    })

    expect(insertedValues.map(v => v.supersetGroup)).toEqual(['g1', 'g1', null])
  })
})

// snapshotPlan() must carry the Template's structural grouping into the
// session-owned rows verbatim — supersetGroup rides alongside orderIndex /
// equipmentId (ADR-0008). Mock tx captures the inserted session_exercises rows.
describe('WorkoutsService.snapshotPlan superset carry', () => {
  function makeTx(templateExercises: any[]) {
    const insertedSessionExercises: any[] = []
    const tx = {
      // first select(): existing-snapshot guard -> none; second: template fetch
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
            orderBy: vi.fn(() => Promise.resolve(templateExercises)),
          })),
        })),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((v: any) => {
          if (table === schema.sessionExercises) {
            insertedSessionExercises.push(v)
          }
          return Promise.resolve()
        }),
      })),
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
    }
    return { tx, insertedSessionExercises }
  }

  it('copies each template exercise supersetGroup into the session_exercises row verbatim', async () => {
    const svc = new WorkoutsService({} as any, {} as any, {} as any, {} as any)
    const { tx, insertedSessionExercises } = makeTx([
      { exerciseId: 'e1', orderIndex: 0, defaultSets: 1, supersetGroup: null, equipmentId: null },
      { exerciseId: 'e2', orderIndex: 1, defaultSets: 1, supersetGroup: 'g1', equipmentId: null },
      { exerciseId: 'e3', orderIndex: 2, defaultSets: 1, supersetGroup: 'g1', equipmentId: null },
    ])

    await (svc as any).snapshotPlan(tx, 'sess1', 'u1', 'tpl1')

    expect(insertedSessionExercises.map(r => [r.exerciseId, r.supersetGroup])).toEqual([
      ['e1', null],
      ['e2', 'g1'],
      ['e3', 'g1'],
    ])
  })

  it('backfills null when the Template carries no grouping', async () => {
    const svc = new WorkoutsService({} as any, {} as any, {} as any, {} as any)
    const { tx, insertedSessionExercises } = makeTx([
      { exerciseId: 'e1', orderIndex: 0, defaultSets: 1, supersetGroup: null, equipmentId: null },
      { exerciseId: 'e2', orderIndex: 1, defaultSets: 1, supersetGroup: null, equipmentId: null },
    ])

    await (svc as any).snapshotPlan(tx, 'sess1', 'u1', 'tpl1')

    expect(insertedSessionExercises.every(r => r.supersetGroup === null)).toBe(true)
  })
})
