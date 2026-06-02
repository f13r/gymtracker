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
          where: vi.fn((..._args: unknown[]) => ({
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
