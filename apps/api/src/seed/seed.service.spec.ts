import { describe, it, expect, beforeEach } from 'vitest'

import { SeedService } from './seed.service'
import * as schema from '../drizzle/schema'
import { createFakeDb, type FakeDb } from '../testing/fake-db'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('SeedService on boot', () => {
  let db: FakeDb
  let photosDir: string

  const boot = () => new SeedService(db as any, { getOrThrow: () => photosDir } as any).onModuleInit()

  beforeEach(() => {
    db = createFakeDb()
    photosDir = mkdtempSync(join(tmpdir(), 'seed-'))
  })

  it('seeds the starting library into an empty install', async () => {
    await boot()

    const names = db.rows(schema.exercises).map(e => e.name)
    expect(names).toContain('Bench Press')
    expect(names).toHaveLength(32)
  })

  it('does not re-add starting Exercises to an existing library', async () => {
    db.seed(schema.exercises, { id: 'e1', name: 'Leg Press', imagePath: null, thumbPath: null })

    await boot()

    expect(db.rows(schema.exercises).map(e => e.name)).toEqual(['Leg Press'])
  })

  it('moves Exercise images left in a per-User folder into the shared folder', async () => {
    mkdirSync(join(photosDir, 'default-user', 'exercises'), { recursive: true })
    writeFileSync(join(photosDir, 'default-user/exercises/e1-orig.webp'), 'orig')
    writeFileSync(join(photosDir, 'default-user/exercises/e1-thumb.webp'), 'thumb')
    db.seed(schema.exercises, {
      id: 'e1',
      name: 'Leg Press',
      imagePath: 'default-user/exercises/e1-orig.webp',
      thumbPath: 'default-user/exercises/e1-thumb.webp',
    })

    await boot()
    await boot() // idempotent

    expect(db.rows(schema.exercises)[0]).toMatchObject({
      imagePath: 'exercises/e1-orig.webp',
      thumbPath: 'exercises/e1-thumb.webp',
    })
    expect(existsSync(join(photosDir, 'exercises/e1-orig.webp'))).toBe(true)
    expect(existsSync(join(photosDir, 'default-user/exercises/e1-orig.webp'))).toBe(false)
  })
})
