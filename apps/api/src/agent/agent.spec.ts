import { ConfigService } from '@nestjs/config'
import { type NestFastifyApplication } from '@nestjs/platform-fastify'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentDocumentSchema, type AgentApplyResult, type AgentExport } from '@gymtracker/shared'

import { AgentApplyService } from './agent-apply.service'
import { AgentExportService } from './agent-export.service'
import { IMAGE_CLIENT, type ImageClient } from './agent-images'
import { AgentController } from './agent.controller'
import * as schema from '../drizzle/schema'
import { createAuthedApp } from '../testing/access-tokens'
import { createFakeDb, type FakeDb } from '../testing/fake-db'
import { mkdirSync, mkdtempSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const AGENT = { 'x-dev-agent': '1' }
const DAY = 86400
const now = () => Math.floor(Date.now() / 1000)

/** The household: two Users, a small library (one Exercise archived), u1's plan and history. */
function seedHousehold(db: FakeDb) {
  db.seed(schema.users, { id: 'u1', displayName: 'User One', email: 'one@example.com', createdAt: 0 })
  db.seed(schema.users, { id: 'u2', displayName: 'User Two', email: 'two@example.com', createdAt: 0 })
  const ex = (id: string, name: string, extra: Partial<typeof schema.exercises.$inferInsert> = {}) =>
    db.seed(schema.exercises, {
      id,
      name,
      category: 'push',
      equipmentType: 'barbell',
      description: null,
      imagePath: null,
      thumbPath: null,
      archivedAt: null,
      createdAt: 0,
      ...extra,
    })
  ex('e-bench', 'Bench Press')
  ex('e-squat', 'Squat', { category: 'legs' })
  ex('e-fly', 'Cable Fly', { equipmentType: 'cable' })
  ex('e-dip', 'Dip', { equipmentType: 'bodyweight', archivedAt: 100 })
  ex('e-pull', 'Pull-up', { category: 'pull', equipmentType: 'bodyweight' })

  db.seed(schema.workoutTemplates, { id: 't-push', userId: 'u1', name: 'Push', notes: 'Chest day', createdAt: 1 })
  db.seed(schema.workoutTemplates, { id: 't-legs', userId: 'u1', name: 'Legs', notes: null, createdAt: 2 })
  db.seed(schema.workoutTemplates, { id: 't-u2', userId: 'u2', name: 'Push', notes: null, createdAt: 3 })
  const te = (id: string, templateId: string, exerciseId: string, orderIndex: number, more = {}) =>
    db.seed(schema.templateExercises, {
      id,
      templateId,
      exerciseId,
      orderIndex,
      defaultSets: 3,
      defaultReps: 8,
      defaultWeightKg: null,
      equipmentId: null,
      supersetGroup: null,
      ...more,
    })
  te('te1', 't-push', 'e-bench', 0, { defaultWeightKg: 60 })
  te('te2', 't-push', 'e-fly', 1, { supersetGroup: 'aaaa-uuid' })
  te('te3', 't-push', 'e-pull', 2, { supersetGroup: 'aaaa-uuid', defaultReps: 10 })
  te('te4', 't-legs', 'e-squat', 0, { defaultSets: 5, defaultReps: 5, defaultWeightKg: 100 })
  te('te5', 't-u2', 'e-bench', 0)

  const schedule = (id: string, userId: string, templateId: string, type: 'weekly' | 'once', day: number | string) =>
    db.seed(schema.workoutSchedules, {
      id,
      userId,
      templateId,
      type,
      dayOfWeek: type === 'weekly' ? day : null,
      scheduledDate: type === 'once' ? day : null,
      createdAt: 0,
    })
  schedule('s-mon', 'u1', 't-push', 'weekly', 1)
  schedule('s-wed', 'u1', 't-legs', 'weekly', 3)
  schedule('s-once', 'u1', 't-push', 'once', '2026-12-01')
  schedule('s-u2', 'u2', 't-u2', 'weekly', 1)

  db.seed(schema.userProfiles, {
    userId: 'u1',
    age: 40,
    heightCm: 180,
    gender: 'male',
    experienceLevel: 'intermediate',
    goal: 'strength',
    trainingPhase: null,
    trainingDays: JSON.stringify(['monday', 'wednesday']),
    sessionDurationMinutes: 60,
    updatedAt: 0,
  })

  // u1 trained Bench twice in the window (one Set missed, one removed); u2's Session must not show.
  const set = (
    id: string,
    session: { id: string; userId: string; startedAt: number },
    exerciseId: string,
    v: { reps: number | null; weightKg: number | null; done: number; removedAt?: number | null },
  ) =>
    db.seed(
      schema.sets,
      { id, sessionId: session.id, exerciseId, setNumber: 1, removedAt: null, ...v },
      {
        'workout_sessions.user_id': session.userId,
        'workout_sessions.started_at': session.startedAt,
        'workout_sessions.finished_at': session.startedAt + 3600,
      },
    )
  const s1 = { id: 'ws1', userId: 'u1', startedAt: now() - 10 * DAY }
  const s2 = { id: 'ws2', userId: 'u1', startedAt: now() - 3 * DAY }
  const old = { id: 'ws0', userId: 'u1', startedAt: now() - 100 * DAY }
  const other = { id: 'ws9', userId: 'u2', startedAt: now() - 2 * DAY }
  set('a1', s1, 'e-bench', { reps: 8, weightKg: 60, done: 1 })
  set('a2', s1, 'e-bench', { reps: 8, weightKg: 60, done: 0 })
  set('a3', s2, 'e-bench', { reps: 6, weightKg: 70, done: 1 })
  set('a4', s2, 'e-bench', { reps: 6, weightKg: 70, done: 0, removedAt: now() })
  set('a5', s2, 'e-squat', { reps: 5, weightKg: 100, done: 1 })
  set('a0', old, 'e-bench', { reps: 1, weightKg: 200, done: 1 })
  set('a9', other, 'e-bench', { reps: 1, weightKg: 150, done: 1 })
}

let app: NestFastifyApplication | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

async function setup(opts: { images?: ImageClient } = {}) {
  const db = createFakeDb()
  seedHousehold(db)
  const photosDir = mkdtempSync(join(tmpdir(), 'agent-api-'))
  const offline: ImageClient = {
    resolve: () => Promise.reject(new Error('no DNS in tests')),
    fetch: () => Promise.reject(new Error('no network in tests')),
  }
  app = await createAuthedApp({
    config: { mode: 'dev', defaultUserId: 'u1' },
    db,
    metadata: {
      controllers: [AgentController],
      providers: [
        AgentApplyService,
        AgentExportService,
        { provide: ConfigService, useValue: new ConfigService({ PHOTOS_DIR: photosDir }) },
        { provide: IMAGE_CLIENT, useValue: opts.images ?? offline },
      ],
    },
  })
  const api = app
  const get = (url: string, headers: Record<string, string> = AGENT) => api.inject({ method: 'GET', url, headers })
  const apply = (doc: unknown, confirm = false) =>
    api.inject({
      method: 'POST',
      url: `/api/agent/apply${confirm ? '?confirm=true' : ''}`,
      headers: AGENT,
      payload: doc as object,
    })
  return { db, photosDir, get, apply }
}

describe('Agent API routing', () => {
  it('serves the Agent and refuses a User (403)', async () => {
    const { get } = await setup()
    expect((await get('/api/agent/schema')).statusCode).toBe(200)
    expect((await get('/api/agent/schema', {})).statusCode).toBe(403)
    expect((await get('/api/agent/export', { 'x-dev-user': 'u1' })).statusCode).toBe(403)
  })
})

describe('GET /api/agent/schema', () => {
  it('is the JSON Schema of the apply document', async () => {
    const { get } = await setup()
    const json = (await get('/api/agent/schema')).json() as { $schema: string; properties: Record<string, unknown> }
    expect(json.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(Object.keys(json.properties).sort()).toEqual(['exercises', 'remove', 'templates', 'user', 'weekly'])
  })
})

describe('GET /api/agent/export', () => {
  it('without a user: the whole library, archived ones flagged, and nothing per-User', async () => {
    const { get } = await setup()
    const body = (await get('/api/agent/export')).json() as AgentExport
    expect(body.exercises.map(e => e.name)).toEqual(['Bench Press', 'Cable Fly', 'Dip', 'Pull-up', 'Squat'])
    expect(body.exercises.find(e => e.name === 'Dip')).toEqual({
      name: 'Dip',
      category: 'push',
      equipmentType: 'bodyweight',
      description: null,
      hasImage: false,
      archived: true,
    })
    expect(body.user).toBeUndefined()
  })

  it("with a user: that User's Templates, weekly Schedule, Profile and training summary", async () => {
    const { get } = await setup()
    const { user } = (await get('/api/agent/export?user=u1&weeks=8')).json() as AgentExport
    expect(user?.id).toBe('u1')
    expect(user?.templates).toEqual([
      { name: 'Legs', notes: null, exercises: [{ exercise: 'Squat', sets: 5, reps: 5, weightKg: 100 }] },
      {
        name: 'Push',
        notes: 'Chest day',
        exercises: [
          { exercise: 'Bench Press', sets: 3, reps: 8, weightKg: 60 },
          { exercise: 'Cable Fly', sets: 3, reps: 8, weightKg: null, supersetGroup: 'A' },
          { exercise: 'Pull-up', sets: 3, reps: 10, weightKg: null, supersetGroup: 'A' },
        ],
      },
    ])
    expect(user?.weekly).toEqual({ mon: 'Push', tue: null, wed: 'Legs', thu: null, fri: null, sat: null, sun: null })
    expect(user?.profile).toMatchObject({ goal: 'strength', trainingDays: ['monday', 'wednesday'] })
    expect(user?.history.weeks).toBe(8)
    const bench = user?.history.exercises.find(e => e.exercise === 'Bench Press')
    expect(bench).toMatchObject({ sessions: 2, doneSets: 2, missedSets: 1, removedSets: 1, volumeKg: 900 })
    expect(bench?.dates).toHaveLength(2)
    expect(bench?.bestSet).toMatchObject({ weightKg: 70, reps: 6 })
    expect(user?.history.exercises.map(e => e.exercise)).toEqual(['Bench Press', 'Squat'])
  })

  it('the export round-trips: its templates and weekly are a valid apply document', async () => {
    const { get } = await setup()
    const { user } = (await get('/api/agent/export?user=u1')).json() as AgentExport
    const doc = { user: user!.id, templates: user!.templates, weekly: user!.weekly }
    expect(AgentDocumentSchema.safeParse(doc).success).toBe(true)
  })

  it('answers 404 for an unknown user and 400 for a bad window', async () => {
    const { get } = await setup()
    expect((await get('/api/agent/export?user=nobody')).statusCode).toBe(404)
    expect((await get('/api/agent/export?user=u1&weeks=0')).statusCode).toBe(400)
    expect((await get('/api/agent/export?user=u1&weeks=abc')).statusCode).toBe(400)
  })
})

const tables = (db: FakeDb) =>
  JSON.stringify(
    [
      schema.exercises,
      schema.workoutTemplates,
      schema.templateExercises,
      schema.workoutSchedules,
      schema.agentChanges,
      schema.userExerciseNotes,
    ].map(t => db.rows(t)),
  )

const PLAN = {
  user: 'u1',
  exercises: [
    { name: 'Face Pull', category: 'pull', equipmentType: 'cable' },
    { name: 'bench press', description: 'Retract the shoulder blades' },
  ],
  templates: [
    {
      name: 'Push',
      exercises: [
        { exercise: 'Bench Press', sets: 4, reps: 6, weightKg: 70 },
        { exercise: 'Face Pull', sets: 3, reps: 15 },
      ],
    },
    { name: 'Pull', notes: 'Back day', exercises: [{ exercise: 'Pull-up', sets: 4, reps: 8 }] },
  ],
  weekly: { mon: 'Push', fri: 'Pull' },
}

const result = (res: { json: () => unknown }) => res.json() as AgentApplyResult
const change = (r: AgentApplyResult, entity: string, name: string) =>
  r.changes.find(c => c.entity === entity && c.name === name)

describe('POST /api/agent/apply: dry-run', () => {
  it('returns the diff and writes nothing', async () => {
    const { db, apply } = await setup()
    const before = tables(db)

    const res = await apply(PLAN)

    expect(res.statusCode).toBe(200)
    const r = result(res)
    expect(r).toMatchObject({ applied: false, changeId: null, errors: [], user: { id: 'u1', displayName: 'User One' } })
    expect(change(r, 'exercise', 'Face Pull')).toMatchObject({
      action: 'created',
      changes: { category: { old: null, new: 'pull' }, equipmentType: { old: null, new: 'cable' } },
    })
    expect(change(r, 'exercise', 'bench press')).toEqual({
      entity: 'exercise',
      name: 'bench press',
      action: 'updated',
      changes: {
        name: { old: 'Bench Press', new: 'bench press' },
        description: { old: null, new: 'Retract the shoulder blades' },
      },
    })
    expect(change(r, 'template', 'Push')).toEqual({
      entity: 'template',
      name: 'Push',
      action: 'updated',
      changes: {
        exercises: {
          // Exercises go by their name after this document, so a rename alone never shows here.
          old: ['bench press 3×8 @60kg', 'Cable Fly 3×8 [A]', 'Pull-up 3×10 [A]'],
          new: ['bench press 4×6 @70kg', 'Face Pull 3×15'],
        },
      },
    })
    expect(change(r, 'template', 'Pull')).toMatchObject({ action: 'created' })
    expect(change(r, 'weekly', 'mon')).toEqual({ entity: 'weekly', name: 'mon', action: 'unchanged' })
    expect(change(r, 'weekly', 'wed')).toMatchObject({
      action: 'deleted',
      changes: { template: { old: 'Legs', new: null } },
    })
    expect(change(r, 'weekly', 'fri')).toMatchObject({
      action: 'created',
      changes: { template: { old: null, new: 'Pull' } },
    })
    expect(r.summary).toEqual({ created: 3, updated: 2, unchanged: 1, deleted: 1 })
    expect(tables(db)).toBe(before)
  })

  it('reports an unchanged document as unchanged', async () => {
    const { apply } = await setup()
    const r = result(
      await apply({
        user: 'u1',
        exercises: [{ name: 'Squat', category: 'legs' }],
        templates: [{ name: 'Legs', exercises: [{ exercise: 'Squat', sets: 5, reps: 5, weightKg: 100 }] }],
        weekly: { mon: 'Push', wed: 'Legs' },
      }),
    )
    expect(r.summary).toEqual({ unchanged: 4 })
  })
})

describe('POST /api/agent/apply?confirm=true', () => {
  it('applies the whole document, records it in agent_changes, and matches the dry-run', async () => {
    const { db, apply, get } = await setup()
    const dry = result(await apply(PLAN))

    const res = await apply(PLAN, true)

    expect(res.statusCode).toBe(200)
    const r = result(res)
    expect(r.applied).toBe(true)
    expect(r.changes).toEqual(dry.changes)
    const { user } = (await get('/api/agent/export?user=u1')).json() as AgentExport
    expect(user?.templates.map(t => t.name)).toEqual(['Legs', 'Pull', 'Push'])
    expect(user?.templates.find(t => t.name === 'Push')?.exercises).toEqual([
      { exercise: 'bench press', sets: 4, reps: 6, weightKg: 70 },
      { exercise: 'Face Pull', sets: 3, reps: 15, weightKg: null },
    ])
    expect(user?.weekly).toMatchObject({ mon: 'Push', wed: null, fri: 'Pull' })
    const audit = db.rows(schema.agentChanges)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ id: r.changeId, targetUserId: 'u1', document: PLAN })
    expect((audit[0]!.diff as AgentApplyResult).changes).toEqual(r.changes)
  })

  it('keeps the Template row (same id) and its Schedules when replacing its exercises', async () => {
    const { db, apply } = await setup()
    await apply(PLAN, true)
    const push = db.rows(schema.workoutTemplates).filter(t => t.name === 'Push')
    expect(push.map(t => t.id)).toEqual(['t-push', 't-u2'])
    expect(db.rows(schema.workoutSchedules).find(s => s.id === 's-mon')).toBeDefined()
  })

  it('rolls everything back when a write fails part-way (500, nothing applied)', async () => {
    const { db, apply } = await setup()
    const before = tables(db)
    const insert = db.insert.bind(db)
    db.insert = ((table: Parameters<typeof insert>[0]) => {
      // The audit row is the very last write of a confirmed apply, after every other one.
      if (table === schema.agentChanges) {
        throw new Error('disk full')
      }
      return insert(table)
    }) as typeof db.insert

    const res = await apply(PLAN, true)

    expect(res.statusCode).toBe(500)
    expect(tables(db)).toBe(before)
  })

  it('applies nothing when any item is invalid (422 with every error)', async () => {
    const { db, apply } = await setup()
    const before = tables(db)

    const res = await apply(
      {
        user: 'u1',
        exercises: [{ name: 'Face Pull' }],
        templates: [{ name: 'Pull', exercises: [{ exercise: 'Barbell Row', sets: 3, reps: 8 }] }],
        weekly: { tue: 'Arms' },
      },
      true,
    )

    expect(res.statusCode).toBe(422)
    const r = result(res)
    expect(r.applied).toBe(false)
    expect(r.errors).toEqual([
      { path: 'templates.0.exercises.0.exercise', message: expect.stringContaining('No Exercise named "Barbell Row"') },
      { path: 'weekly.tue', message: expect.stringContaining('"Arms"') },
    ])
    expect(tables(db)).toBe(before)
  })

  it('answers 400 for a malformed document and 422 for an unknown User', async () => {
    const { apply } = await setup()
    const bad = await apply({ templates: [{ name: 'X', exercises: [] }] })
    expect(bad.statusCode).toBe(400)
    expect((bad.json() as { errors: { path: string }[] }).errors.map(e => e.path)).toEqual(
      expect.arrayContaining(['templates.0.exercises']),
    )
    const unknown = await apply({ user: 'nobody', weekly: {} })
    expect(unknown.statusCode).toBe(422)
    expect(result(unknown).errors).toEqual([{ path: 'user', message: 'No User "nobody"' }])
  })
})

describe('apply: the Exercise library', () => {
  it('renames with renameFrom, and Templates follow the new name', async () => {
    const { apply, get } = await setup()
    const r = result(await apply({ exercises: [{ name: 'Cable Crossover', renameFrom: 'cable fly' }] }, true))
    expect(r.changes).toEqual([
      { entity: 'exercise', name: 'Cable Crossover', action: 'renamed', renamedFrom: 'Cable Fly' },
    ])
    const body = (await get('/api/agent/export?user=u1')).json() as AgentExport
    expect(body.exercises.map(e => e.name)).toContain('Cable Crossover')
    expect(body.user?.templates.find(t => t.name === 'Push')?.exercises[1]?.exercise).toBe('Cable Crossover')
  })

  it('refuses a rename onto a taken name, 409-style', async () => {
    const { apply } = await setup()
    const res = await apply({ exercises: [{ name: 'Squat', renameFrom: 'Cable Fly' }] }, true)
    expect(res.statusCode).toBe(422)
    expect(result(res).errors).toEqual([{ path: 'exercises.0.name', message: expect.stringContaining('409') }])
  })

  it('restores an Archived Exercise listed by name, so a Template may use it', async () => {
    const { apply } = await setup()
    const doc = {
      user: 'u1',
      exercises: [{ name: 'Dip' }],
      templates: [{ name: 'Push', exercises: [{ exercise: 'Dip', sets: 3, reps: 10 }] }],
    }
    const r = result(await apply(doc, true))
    expect(change(r, 'exercise', 'Dip')).toEqual({ entity: 'exercise', name: 'Dip', action: 'restored' })
    expect(r.applied).toBe(true)
  })

  it('refuses an Archived Exercise in a Template unless the document restores it', async () => {
    const { apply } = await setup()
    const res = await apply({
      user: 'u1',
      templates: [{ name: 'Push', exercises: [{ exercise: 'dip', sets: 3, reps: 10 }] }],
    })
    expect(res.statusCode).toBe(422)
    expect(result(res).errors[0]?.message).toMatch(/archived/)
  })

  it('removes by the archive rule: archived while referenced, deleted otherwise', async () => {
    const { db, apply } = await setup()
    const r = result(await apply({ remove: { exercises: ['Squat', 'Dip'] } }, true))
    expect(change(r, 'exercise', 'Squat')?.action).toBe('archived')
    expect(change(r, 'exercise', 'Dip')?.action).toBe('deleted')
    expect(db.rows(schema.exercises).find(e => e.id === 'e-squat')?.archivedAt).not.toBeNull()
    expect(db.rows(schema.exercises).find(e => e.id === 'e-dip')).toBeUndefined()
  })

  it('deletes an Exercise whose last Template use this same document drops', async () => {
    const { apply } = await setup()
    const doc = {
      user: 'u1',
      templates: [{ name: 'Push', exercises: [{ exercise: 'Bench Press', sets: 3, reps: 8 }] }],
      remove: { exercises: ['Cable Fly'] },
    }
    expect(change(result(await apply(doc)), 'exercise', 'Cable Fly')?.action).toBe('deleted')
  })

  it('refuses removing an Exercise a Template in the document still uses', async () => {
    const { apply } = await setup()
    const doc = {
      user: 'u1',
      templates: [{ name: 'Legs', exercises: [{ exercise: 'Squat', sets: 3, reps: 8 }] }],
      remove: { exercises: ['Squat'] },
    }
    const res = await apply(doc)
    expect(res.statusCode).toBe(422)
    expect(result(res).errors[0]?.path).toBe('templates.0.exercises.0.exercise')
  })
})

describe('apply: Templates and the weekly Schedule', () => {
  it('matches a Template by name per User, ignoring case, and never touches another User’s', async () => {
    const { db, apply } = await setup()
    const doc = { user: 'u1', templates: [{ name: 'PUSH', exercises: [{ exercise: 'Squat', sets: 1, reps: 1 }] }] }
    const r = result(await apply(doc, true))
    expect(change(r, 'template', 'PUSH')?.action).toBe('updated')
    expect(db.rows(schema.workoutTemplates)).toHaveLength(3)
    expect(db.rows(schema.templateExercises).filter(e => e.templateId === 't-u2')).toHaveLength(1)
  })

  it('renames a Template with renameFrom', async () => {
    const { db, apply } = await setup()
    const lower = {
      name: 'Lower',
      renameFrom: 'Legs',
      exercises: [{ exercise: 'Squat', sets: 5, reps: 5, weightKg: 100 }],
    }
    expect(result(await apply({ user: 'u1', templates: [lower] }, true)).changes).toEqual([
      { entity: 'template', name: 'Lower', action: 'renamed', renamedFrom: 'Legs' },
    ])
    expect(db.rows(schema.workoutTemplates).find(t => t.id === 't-legs')?.name).toBe('Lower')
  })

  it('keeps superset grouping by label, whatever the labels are called', async () => {
    const { db, apply } = await setup()
    const push = {
      name: 'Push',
      exercises: [
        { exercise: 'Bench Press', sets: 3, reps: 8, weightKg: 60 },
        { exercise: 'Cable Fly', sets: 3, reps: 8, supersetGroup: 'x' },
        { exercise: 'Pull-up', sets: 3, reps: 10, supersetGroup: 'x' },
      ],
    }
    expect(result(await apply({ user: 'u1', templates: [push] })).summary).toEqual({ unchanged: 1 })
    const split = { ...push, exercises: push.exercises.map((e, i) => (i === 2 ? { ...e, supersetGroup: 'y' } : e)) }
    await apply({ user: 'u1', templates: [split] }, true)
    const groups = db
      .rows(schema.templateExercises)
      .filter(e => e.templateId === 't-push')
      .map(e => e.supersetGroup)
    expect(groups[0]).toBeNull()
    expect(groups[1]).not.toBe(groups[2])
  })

  it('replaces the weekly Schedule as a whole and leaves one-off Schedules alone', async () => {
    const { db, apply } = await setup()
    await apply({ user: 'u1', weekly: { tue: 'Legs' } }, true)
    const mine = db.rows(schema.workoutSchedules).filter(s => s.userId === 'u1')
    expect(mine.filter(s => s.type === 'weekly').map(s => [s.dayOfWeek, s.templateId])).toEqual([[2, 't-legs']])
    expect(mine.find(s => s.id === 's-once')).toBeDefined()
    expect(db.rows(schema.workoutSchedules).find(s => s.id === 's-u2')).toBeDefined()
  })

  it('deletes a Template listed under remove, with its Schedules', async () => {
    const { db, apply } = await setup()
    const r = result(await apply({ user: 'u1', remove: { templates: ['push'] } }, true))
    expect(r.changes).toEqual([
      { entity: 'template', name: 'Push', action: 'deleted', note: 'also deletes its 2 Schedule(s)' },
    ])
    expect(db.rows(schema.workoutTemplates).map(t => t.id)).toEqual(['t-legs', 't-u2'])
    expect(db.rows(schema.workoutSchedules).map(s => s.id)).toEqual(['s-wed', 's-u2'])
  })
})

describe('the audit trail', () => {
  it('lists applied documents at GET /changes and in the export, not dry-runs', async () => {
    const { apply, get } = await setup()
    await apply({ exercises: [{ name: 'Face Pull' }] })
    const applied = result(await apply({ exercises: [{ name: 'Face Pull' }] }, true))

    const changes = (await get('/api/agent/changes')).json() as { id: string; document: unknown }[]
    expect(changes).toEqual([
      expect.objectContaining({ id: applied.changeId, document: { exercises: [{ name: 'Face Pull' }] } }),
    ])
    const body = (await get('/api/agent/export')).json() as AgentExport
    expect(body.recentChanges).toEqual([
      { id: applied.changeId, createdAt: expect.any(String), targetUserId: null, summary: { created: 1 } },
    ])
  })
})

describe('apply: Exercise images from imageUrl', () => {
  const URL_OK = 'https://img.example.com/face-pull.png'
  const fakeWeb = () => {
    const calls: string[] = []
    const client: ImageClient = {
      resolve: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
      fetch: async ({ url }) => {
        calls.push(url.toString())
        if (url.toString() !== URL_OK) {
          return new Response('gone', { status: 404 })
        }
        const png = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#0f0' } })
          .png()
          .toBuffer()
        return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
      },
    }
    return { calls, client }
  }
  const files = (dir: string) =>
    readdirSync(join(dir, 'exercises'), { withFileTypes: true })
      .map(f => f.name)
      .sort()

  it('dry-run says the image will be fetched and downloads nothing', async () => {
    const web = fakeWeb()
    const { apply } = await setup({ images: web.client })
    const r = result(await apply({ exercises: [{ name: 'Face Pull', imageUrl: URL_OK }] }))
    expect(r.changes[0]).toMatchObject({ action: 'created', note: 'image will be fetched on apply' })
    expect(web.calls).toEqual([])
  })

  it('on confirm stores the image as the usual .webp orig + thumb in the shared folder', async () => {
    const web = fakeWeb()
    const { db, apply, get, photosDir } = await setup({ images: web.client })
    const r = result(await apply({ exercises: [{ name: 'Face Pull', imageUrl: URL_OK }] }, true))
    expect(r.applied).toBe(true)
    const row = db.rows(schema.exercises).find(e => e.name === 'Face Pull')!
    expect(row.imagePath).toBe(`exercises/${row.id}-orig.webp`)
    expect(files(photosDir)).toEqual([`${row.id}-orig.webp`, `${row.id}-thumb.webp`])
    const thumb = await sharp(join(photosDir, row.thumbPath as string)).metadata()
    expect([thumb.format, thumb.width]).toEqual(['webp', 400])
    const body = (await get('/api/agent/export')).json() as AgentExport
    expect(body.exercises.find(e => e.name === 'Face Pull')?.hasImage).toBe(true)
  })

  it('replaces the image of an existing Exercise', async () => {
    const { db, apply, photosDir } = await setup({ images: fakeWeb().client })
    const r = result(await apply({ exercises: [{ name: 'Squat', imageUrl: URL_OK }] }, true))
    expect(r.changes[0]).toMatchObject({ action: 'updated', changes: { image: { old: null, new: URL_OK } } })
    expect(db.rows(schema.exercises).find(e => e.id === 'e-squat')?.thumbPath).toBe('exercises/e-squat-thumb.webp')
    expect(files(photosDir)).toEqual(['e-squat-orig.webp', 'e-squat-thumb.webp'])
  })

  it('applies nothing when an image cannot be downloaded, and leaves no files behind', async () => {
    const { db, apply, photosDir } = await setup({ images: fakeWeb().client })
    const before = tables(db)
    const res = await apply(
      {
        exercises: [
          { name: 'Face Pull', imageUrl: URL_OK },
          { name: 'Shrug', imageUrl: 'https://img.example.com/missing.png' },
        ],
      },
      true,
    )
    expect(res.statusCode).toBe(422)
    expect(result(res).errors).toEqual([
      { path: 'exercises.1.imageUrl', message: 'Image download failed with HTTP 404' },
    ])
    expect(tables(db)).toBe(before)
    expect(files(photosDir)).toEqual([])
  })
})

/** Change a seeded Exercise row in place (the fake db stores row objects by reference). */
function patchExercise(db: FakeDb, id: string, patch: Record<string, unknown>) {
  const row = db.rows(schema.exercises).find(r => r.id === id)
  Object.assign(row!, patch)
}

describe('GET /api/agent/exercise-image', () => {
  async function withImage() {
    const ctx = await setup()
    const dir = join(ctx.photosDir, 'exercises')
    mkdirSync(dir, { recursive: true })
    await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } })
      .webp()
      .toFile(join(dir, 'b-orig.webp'))
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#0f0' } })
      .webp()
      .toFile(join(dir, 'b-thumb.webp'))
    patchExercise(ctx.db, 'e-bench', { imagePath: 'exercises/b-orig.webp', thumbPath: 'exercises/b-thumb.webp' })
    return ctx
  }

  it('streams the thumb by default and the full image on request, matching the name case-insensitively', async () => {
    const { get } = await withImage()
    const thumb = await get('/api/agent/exercise-image?name=bench%20press')
    expect(thumb.statusCode).toBe(200)
    expect(thumb.headers['content-type']).toBe('image/webp')
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(2)
    const full = await get('/api/agent/exercise-image?name=Bench%20Press&size=full')
    expect((await sharp(full.rawPayload).metadata()).width).toBe(4)
  })

  it('is Agent-only, 404s for unknown names or missing images, and 400s without a name', async () => {
    const { get } = await withImage()
    expect((await get('/api/agent/exercise-image?name=Bench%20Press', { 'x-dev-user': 'u1' })).statusCode).toBe(403)
    expect((await get('/api/agent/exercise-image?name=Nope')).statusCode).toBe(404)
    expect((await get('/api/agent/exercise-image?name=Squat')).statusCode).toBe(404)
    expect((await get('/api/agent/exercise-image')).statusCode).toBe(400)
    expect((await get('/api/agent/exercise-image?name=Squat&size=huge')).statusCode).toBe(400)
  })

  it('refuses a stored path that would leave the photos folder', async () => {
    const { db, get } = await withImage()
    patchExercise(db, 'e-bench', { thumbPath: '../../etc/hostname' })
    expect((await get('/api/agent/exercise-image?name=Bench%20Press')).statusCode).toBe(404)
  })
})
