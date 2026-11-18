import { beforeEach, describe, expect, it } from 'vitest'

import { assertTrainerLinks } from './trainer-links'
import * as schema from '../drizzle/schema'
import { createFakeDb, type FakeDb } from '../testing/fake-db'

describe('assertTrainerLinks', () => {
  let db: FakeDb

  beforeEach(() => {
    db = createFakeDb()
    db.seed(schema.users, { id: 'a', displayName: 'A', email: null, createdAt: 0 })
    db.seed(schema.users, { id: 'b', displayName: 'B', email: null, createdAt: 0 })
  })

  it('resolves when every id is a User', async () => {
    await expect(assertTrainerLinks(db as any, [{ trainerId: 'a', athleteId: 'b' }])).resolves.toBeUndefined()
  })

  it('resolves for no links', async () => {
    await expect(assertTrainerLinks(db as any, [])).resolves.toBeUndefined()
  })

  it('rejects naming the unknown User', async () => {
    await expect(assertTrainerLinks(db as any, [{ trainerId: 'a', athleteId: 'ghost' }])).rejects.toThrow(
      /unknown User "ghost"/,
    )
  })
})
