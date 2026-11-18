import { Controller, Get, Inject, Post, Req } from '@nestjs/common'
import { type NestFastifyApplication } from '@nestjs/platform-fastify'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AgentOnly } from './agent-only.decorator'
import { Public } from './public.decorator'
import type { AuthenticatedRequest } from './request.types'
import { TrainerAccess } from './trainer-access.decorator'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { cloudflareTestConfig, createAuthedApp, createTestAccess } from '../testing/access-tokens'
import { createFakeDb } from '../testing/fake-db'

type FakeDb = ReturnType<typeof createFakeDb>

/** Test-only routes: real controllers are marked `@TrainerAccess` in their own tasks. */
@Controller()
class ProbeController {
  constructor(@Inject(DATABASE) private readonly db: FakeDb) {}

  @TrainerAccess('read')
  @Get('templates')
  async templates(@Req() req: AuthenticatedRequest) {
    return this.db.select().from(schema.workoutTemplates).where(eq(schema.workoutTemplates.userId, req.user.id))
  }

  @Get('unmarked')
  unmarked(@Req() req: AuthenticatedRequest) {
    return { id: req.user.id, actor: req.actor?.id ?? null }
  }

  @TrainerAccess('read')
  @Get('who')
  who(@Req() req: AuthenticatedRequest) {
    return { id: req.user.id, actor: req.actor?.id ?? null }
  }

  @TrainerAccess('read')
  @Post('misclassified')
  misclassified() {
    return { ok: true }
  }

  @AgentOnly()
  @Get('agent')
  agent() {
    return { ok: true }
  }

  @Public()
  @Get('public')
  open(@Req() req: AuthenticatedRequest) {
    return { user: req.user?.id ?? null }
  }
}

function seed() {
  const db = createFakeDb()
  db.seed(schema.users, { id: 'u1', displayName: 'User One', email: 'one@example.com', createdAt: 0 })
  db.seed(schema.users, { id: 'u2', displayName: 'User Two', email: 'two@example.com', createdAt: 0 })
  db.seed(schema.users, { id: 'u3', displayName: 'User Three', email: 'three@example.com', createdAt: 0 })
  db.seed(schema.workoutTemplates, { id: 't1', userId: 'u1', name: 'Push (u1)', notes: null, createdAt: 1 })
  db.seed(schema.workoutTemplates, { id: 't2', userId: 'u2', name: 'Legs (u2)', notes: null, createdAt: 2 })
  return db
}

const links = [
  { trainerId: 'u1', athleteId: 'u2' },
  { trainerId: 'u1', athleteId: 'ghost' }, // linked, but there is no User row
]

describe('acting as an athlete (Cloudflare)', () => {
  let app: NestFastifyApplication
  let tokens: Record<'u1' | 'u2' | 'u3', string>

  beforeAll(async () => {
    const access = await createTestAccess()
    tokens = {
      u1: await access.sign({ email: 'one@example.com' }),
      u2: await access.sign({ email: 'two@example.com' }),
      u3: await access.sign({ email: 'three@example.com' }),
    }
    app = await createAuthedApp({
      config: { ...cloudflareTestConfig, trainerLinks: links },
      db: seed(),
      keys: access.jwks,
      metadata: { controllers: [ProbeController] },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  const get = (url: string, user: 'u1' | 'u2' | 'u3', actAs?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: { 'cf-access-jwt-assertion': tokens[user], ...(actAs === undefined ? {} : { 'x-act-as': actAs }) },
    })

  it('u1 acting as u2 lists u2’s templates', async () => {
    const res = await get('/api/templates', 'u1', 'u2')
    expect(res.statusCode).toBe(200)
    expect((res.json() as { name: string }[]).map(t => t.name)).toEqual(['Legs (u2)'])
  })

  it('sets the athlete as the User and the Trainer as the actor', async () => {
    expect((await get('/api/who', 'u1', 'u2')).json()).toEqual({ id: 'u2', actor: 'u1' })
    expect((await get('/api/who', 'u1')).json()).toEqual({ id: 'u1', actor: null })
  })

  it('trims the header', async () => {
    expect((await get('/api/who', 'u1', '  u2 ')).json()).toEqual({ id: 'u2', actor: 'u1' })
  })

  it('refuses acting as a non-athlete', async () => {
    const res = await get('/api/templates', 'u2', 'u1')
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' })
  })

  it('refuses acting as someone you are not linked to, whether or not they exist', async () => {
    const res = await get('/api/templates', 'u1', 'nobody')
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' })
  })

  it('refuses a linked athlete who has no User row, the same way as no link', async () => {
    const res = await get('/api/templates', 'u1', 'ghost')
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised', reason: 'not-your-athlete' })
  })

  it("refuses a 'read' route called with a non-GET method while acting", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/misclassified',
      headers: { 'cf-access-jwt-assertion': tokens.u1, 'x-act-as': 'u2' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised', reason: 'trainer-access' })
  })

  it("serves a 'read' route with a non-GET method when not acting", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/misclassified',
      headers: { 'cf-access-jwt-assertion': tokens.u1 },
    })
    expect(res.statusCode).toBe(201)
  })

  it('refuses an unmarked route while acting', async () => {
    const res = await get('/api/unmarked', 'u1', 'u2')
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ statusCode: 403, message: 'Not authorised', reason: 'trainer-access' })
  })

  it('serves an unmarked route normally when not acting', async () => {
    expect((await get('/api/unmarked', 'u1')).json()).toEqual({ id: 'u1', actor: null })
  })

  it('ignores x-act-as naming yourself', async () => {
    const res = await get('/api/unmarked', 'u1', 'u1')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'u1', actor: null })
  })

  it('ignores an empty x-act-as', async () => {
    expect((await get('/api/unmarked', 'u1', '  ')).json()).toEqual({ id: 'u1', actor: null })
  })

  it('a link is one-way: the athlete cannot act as the Trainer, and others cannot act as the athlete', async () => {
    expect((await get('/api/who', 'u2', 'u1')).statusCode).toBe(403)
    expect((await get('/api/who', 'u3', 'u2')).json()).toMatchObject({ reason: 'not-your-athlete' })
  })

  it('/me names the signed-in User with their athletes and Trainers', async () => {
    expect((await get('/api/me', 'u1')).json()).toEqual({
      id: 'u1',
      displayName: 'User One',
      athletes: [{ id: 'u2', displayName: 'User Two' }],
      trainers: [],
    })
    expect((await get('/api/me', 'u2')).json()).toEqual({
      id: 'u2',
      displayName: 'User Two',
      athletes: [],
      trainers: [{ id: 'u1', displayName: 'User One' }],
    })
  })

  it('/me is still the Trainer’s own while acting as an athlete', async () => {
    expect((await get('/api/me', 'u1', 'u2')).json()).toEqual({
      id: 'u1',
      displayName: 'User One',
      athletes: [{ id: 'u2', displayName: 'User Two' }],
      trainers: [],
    })
  })

  it('ignores x-act-as on a @Public route', async () => {
    const res = await get('/api/public', 'u1', 'u2')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ user: null })
  })
})

describe('acting as an athlete (Agent and dev mode)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await createAuthedApp({
      config: { mode: 'dev', defaultUserId: 'u3', trainerLinks: links },
      db: seed(),
      metadata: { controllers: [ProbeController] },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it('the Agent’s routes ignore x-act-as', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agent',
      headers: { 'x-dev-agent': '1', 'x-act-as': 'u2' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('works in dev mode', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: { 'x-dev-user': 'u1', 'x-act-as': 'u2' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { name: string }[]).map(t => t.name)).toEqual(['Legs (u2)'])
  })

  it('refuses a non-athlete in dev mode', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: { 'x-dev-user': 'u3', 'x-act-as': 'u2' },
    })
    expect(res.statusCode).toBe(403)
  })
})
