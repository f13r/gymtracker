import { type NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../drizzle/schema'
import { cloudflareTestConfig, createAuthedApp, createTestAccess } from '../testing/access-tokens'
import { createFakeDb } from '../testing/fake-db'
import { WorkoutsController } from '../workouts/workouts.controller'
import { WorkoutsService } from '../workouts/workouts.service'

const unused = {} as never

/** Two Users signed in through (fake) Cloudflare Access each see only their own data. */
describe('two Users through Cloudflare Access', () => {
  let app: NestFastifyApplication
  let tokens: Record<'u1' | 'u2', string>

  beforeAll(async () => {
    const db = createFakeDb()
    db.seed(schema.users, { id: 'u1', displayName: 'User One', email: 'one@example.com', createdAt: 0 })
    db.seed(schema.users, { id: 'u2', displayName: 'User Two', email: 'two@example.com', createdAt: 0 })
    db.seed(schema.workoutTemplates, { id: 't1', userId: 'u1', name: 'Push (u1)', notes: null, createdAt: 1 })
    db.seed(schema.workoutTemplates, { id: 't2', userId: 'u2', name: 'Legs (u2)', notes: null, createdAt: 2 })

    const access = await createTestAccess()
    tokens = {
      u1: await access.sign({ email: 'one@example.com' }),
      u2: await access.sign({ email: 'two@example.com' }),
    }
    app = await createAuthedApp({
      config: cloudflareTestConfig,
      db,
      keys: access.jwks,
      metadata: {
        controllers: [WorkoutsController],
        // Listing and reading templates touch only the database.
        providers: [{ provide: WorkoutsService, useValue: new WorkoutsService(db as never, unused, unused, unused) }],
      },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  const get = (url: string, user: 'u1' | 'u2') =>
    app.inject({ method: 'GET', url, headers: { 'cf-access-jwt-assertion': tokens[user] } })

  it('/api/me names the token’s User', async () => {
    expect((await get('/api/me', 'u1')).json()).toEqual({ id: 'u1', displayName: 'User One' })
    expect((await get('/api/me', 'u2')).json()).toEqual({ id: 'u2', displayName: 'User Two' })
  })

  it('/api/templates lists only the token’s User’s templates', async () => {
    const names = async (user: 'u1' | 'u2') =>
      ((await get('/api/templates', user)).json() as { name: string }[]).map(t => t.name)
    expect(await names('u1')).toEqual(['Push (u1)'])
    expect(await names('u2')).toEqual(['Legs (u2)'])
  })

  it('/api/templates/:id refuses another User’s template', async () => {
    expect((await get('/api/templates/t2', 'u2')).statusCode).toBe(200)
    expect((await get('/api/templates/t2', 'u1')).statusCode).toBe(404)
  })
})
