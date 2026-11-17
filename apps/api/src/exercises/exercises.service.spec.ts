import { ConflictException } from '@nestjs/common'
import sharp from 'sharp'
import { describe, it, expect, beforeEach } from 'vitest'

import { ExercisesService } from './exercises.service'
import * as schema from '../drizzle/schema'
import { createFakeDb, type FakeDb } from '../testing/fake-db'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// One shared Exercise library (ADR 0012): every User sees every live Exercise, and `notes` are
// each User's own. Two Users, u1 and u2.
describe('ExercisesService with a shared library', () => {
  let db: FakeDb
  let photosDir: string
  let svc: ExercisesService

  const exercise = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    db.seed(schema.exercises, {
      id,
      name,
      category: 'push',
      equipmentType: 'barbell',
      description: null,
      imagePath: null,
      thumbPath: null,
      archivedAt: null,
      createdAt: 1,
      ...extra,
    })

  beforeEach(() => {
    db = createFakeDb()
    photosDir = mkdtempSync(join(tmpdir(), 'exercises-svc-'))
    const config = { getOrThrow: () => photosDir }
    svc = new ExercisesService(db as any, config as any)
  })

  it('lists every live Exercise for any User, without archived ones', async () => {
    exercise('e1', 'Bench Press')
    exercise('e2', 'Leg Press')
    exercise('e3', 'Old Machine', { archivedAt: 100 })

    for (const user of ['u1', 'u2']) {
      const names = (await svc.findAll(user)).map(e => e.name).sort()
      expect(names).toEqual(['Bench Press', 'Leg Press'])
    }
  })

  it('shows each User only their own notes on a shared Exercise', async () => {
    exercise('e1', 'Leg Press')
    db.seed(schema.userExerciseNotes, { userId: 'u1', exerciseId: 'e1', notes: 'First set is warmup', updatedAt: 1 })

    expect((await svc.findAll('u1'))[0]).toMatchObject({ id: 'e1', notes: 'First set is warmup', archived: false })
    expect((await svc.findAll('u2'))[0]).toMatchObject({ id: 'e1', notes: null })
    expect(await svc.findOne('e1', 'u2')).toMatchObject({ notes: null })
  })

  it("stores notes per User: u2's note does not change u1's", async () => {
    exercise('e1', 'Leg Press')
    db.seed(schema.userExerciseNotes, { userId: 'u1', exerciseId: 'e1', notes: 'seat 4', updatedAt: 1 })

    const updated = await svc.update('e1', 'u2', { notes: 'seat 7' })

    expect(updated.notes).toBe('seat 7')
    expect((await svc.findOne('e1', 'u1')).notes).toBe('seat 4')
    expect((await svc.findOne('e1', 'u2')).notes).toBe('seat 7')
  })

  it('creates an Exercise with no owner and keeps the creator’s notes for them only', async () => {
    const created = await svc.create('u1', { name: 'Hack Squat', notes: 'narrow stance' })

    expect(created).toMatchObject({ name: 'Hack Squat', notes: 'narrow stance', archived: false })
    expect((await svc.findOne(created.id, 'u2')).notes).toBeNull()
  })

  it('stores a new image in the shared folder and keeps it when replaced', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })
      .png()
      .toBuffer()
    const created = await svc.create('u1', { name: 'Hack Squat' }, png)

    const imageFile = await svc.getImageFile(created.id, 'image')
    expect(imageFile).toBe(join(photosDir, 'exercises', `${created.id}-orig.webp`))
    expect(existsSync(imageFile)).toBe(true)

    await svc.update(created.id, 'u2', {}, { image: png })

    expect(existsSync(imageFile)).toBe(true)
    expect(existsSync(await svc.getImageFile(created.id, 'thumb'))).toBe(true)
  })

  it('refuses a new Exercise whose name matches a live one, case-insensitively, with its id', async () => {
    exercise('e1', 'Leg Press')

    const err = await svc.create('u2', { name: ' leg press ' }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ConflictException)
    expect((err as ConflictException).getResponse()).toMatchObject({ statusCode: 409, exerciseId: 'e1' })
    expect(db.rows(schema.exercises)).toHaveLength(1)
  })

  it('brings back an Archived Exercise when one is created with its name, instead of a duplicate', async () => {
    exercise('e1', 'Bench Press')
    exercise('e2', 'Leg Press', { archivedAt: 100 })

    const created = await svc.create('u2', { name: 'LEG PRESS', notes: 'seat 7' })

    expect(created).toMatchObject({ id: 'e2', name: 'Leg Press', archived: false, notes: 'seat 7' })
    expect((await svc.findAll('u1')).map(e => e.id).sort()).toEqual(['e1', 'e2'])
    expect(db.rows(schema.exercises)).toHaveLength(2)
  })

  it('refuses a rename onto another Exercise’s name, but lets any User re-case its own', async () => {
    exercise('e1', 'Leg Press')
    exercise('e2', 'Leg Curl', { archivedAt: 100 })

    const err = await svc.update('e1', 'u2', { name: 'leg curl' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictException)
    expect((err as ConflictException).getResponse()).toMatchObject({ exerciseId: 'e2' })

    expect(await svc.update('e1', 'u2', { name: 'LEG press' })).toMatchObject({ id: 'e1', name: 'LEG press' })
  })

  it.each([
    ['a Set', schema.sets],
    ['a Template', schema.templateExercises],
    ['a Session snapshot', schema.sessionExercises],
    ['Equipment', schema.equipmentExercises],
    ['a Progression Suggestion', schema.progressionSuggestions],
  ])('archives instead of deleting an Exercise used by %s, and can restore it', async (_, table) => {
    exercise('e1', 'Leg Press')
    db.seed(table, { id: 'ref1', exerciseId: 'e1' })

    expect(await svc.remove('e1')).toEqual({ archived: true })

    expect(await svc.findAll('u1')).toEqual([])
    expect(await svc.findOne('e1', 'u1')).toMatchObject({ id: 'e1', archived: true })

    expect(await svc.restore('e1', 'u1')).toMatchObject({ id: 'e1', archived: false })
    expect((await svc.findAll('u1')).map(e => e.id)).toEqual(['e1'])
  })

  it('deletes an unused Exercise outright, with its image and every User’s notes', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#0f0' } })
      .png()
      .toBuffer()
    const created = await svc.create('u1', { name: 'Hack Squat', notes: 'narrow stance' }, png)
    await svc.update(created.id, 'u2', { notes: 'wide stance' })
    const imageFile = await svc.getImageFile(created.id, 'image')
    exercise('e2', 'Leg Press')
    db.seed(schema.sets, { id: 's1', exerciseId: 'e2' })

    expect(await svc.remove(created.id)).toEqual({ archived: false })

    expect(db.rows(schema.exercises).map(e => e.id)).toEqual(['e2'])
    expect(db.rows(schema.userExerciseNotes)).toEqual([])
    expect(existsSync(imageFile)).toBe(false)
  })

  it('lists only Archived Exercises when asked, so they can be restored', async () => {
    exercise('e1', 'Bench Press')
    exercise('e2', 'Old Machine', { archivedAt: 100 })

    expect(await svc.findAll('u1', { archived: true })).toEqual([expect.objectContaining({ id: 'e2', archived: true })])
  })
})
