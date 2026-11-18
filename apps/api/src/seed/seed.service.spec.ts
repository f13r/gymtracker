import { Logger } from '@nestjs/common'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { SeedService } from './seed.service'
import type { TrainerLink } from '../auth/auth.config'
import * as schema from '../drizzle/schema'
import { createFakeDb, type FakeDb } from '../testing/fake-db'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('SeedService on boot', () => {
  let db: FakeDb
  let photosDir: string
  let env: Record<string, string | undefined>
  let trainerLinks: TrainerLink[]

  const config = { getOrThrow: () => photosDir, get: (key: string) => env[key] }
  const boot = () =>
    new SeedService(db as any, config as any, { mode: 'dev', defaultUserId: 'u1', trainerLinks }).onModuleInit()

  beforeEach(() => {
    db = createFakeDb()
    env = {}
    trainerLinks = []
    photosDir = mkdtempSync(join(tmpdir(), 'seed-'))
  })

  it('seeds the starting library into an empty install', async () => {
    await boot()

    const names = db.rows(schema.exercises).map(e => e.name)
    expect(names).toContain('Bench Press')
    expect(names).toHaveLength(32)
  })

  it('creates no User: Users are provisioned by migration, not re-created on boot', async () => {
    await boot()

    expect(db.rows(schema.users)).toEqual([])
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

  describe('household emails (HOUSEHOLD_EMAILS)', () => {
    const user = (id: string, email: string | null = null) =>
      db.seed(schema.users, { id, displayName: id, email, createdAt: 0 })
    const emails = () => Object.fromEntries(db.rows(schema.users).map(u => [u.id, u.email]))

    it('sets each listed User email, trimmed and lowercased', async () => {
      user('u1')
      user('u2')
      env.HOUSEHOLD_EMAILS = ' u1 : One@Example.com , u2:two@example.com '

      await boot()

      expect(emails()).toEqual({ u1: 'one@example.com', u2: 'two@example.com' })
    })

    it('is idempotent across boots', async () => {
      user('u1')
      env.HOUSEHOLD_EMAILS = 'u1:one@example.com'

      await boot()
      await boot()

      expect(emails()).toEqual({ u1: 'one@example.com' })
    })

    it('skips an unknown User and still sets the others', async () => {
      user('u1')
      env.HOUSEHOLD_EMAILS = 'ghost:ghost@example.com,u1:one@example.com'

      await boot()

      expect(emails()).toEqual({ u1: 'one@example.com' })
    })

    it('skips malformed entries and still sets the others', async () => {
      user('u1')
      user('u2')
      env.HOUSEHOLD_EMAILS = 'u1,:x@example.com,u2:not-an-email,u2,u1:one@example.com'

      await boot()

      expect(emails()).toEqual({ u1: 'one@example.com', u2: null })
    })

    it('leaves emails alone when unset or empty', async () => {
      user('u1', 'kept@example.com')

      await boot()
      env.HOUSEHOLD_EMAILS = '  '
      await boot()

      expect(emails()).toEqual({ u1: 'kept@example.com' })
    })

    it('never writes an email to the log', async () => {
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level =>
        vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      )
      user('u1')
      env.HOUSEHOLD_EMAILS = 'u1:one@example.com,ghost:ghost@example.com,u1-bad@example.com'

      await boot()

      const logged = spies.flatMap(s => s.mock.calls.flat()).join('\n')
      expect(logged).toContain('u1')
      expect(logged).toContain('ghost')
      expect(logged).not.toMatch(/example\.com/)
      spies.forEach(s => s.mockRestore())
    })
  })

  it('refuses to boot when TRAINER_LINKS names an unknown User', async () => {
    db.seed(schema.users, { id: 'a', displayName: 'A', email: null, createdAt: 0 })
    trainerLinks = [{ trainerId: 'a', athleteId: 'ghost' }]

    await expect(boot()).rejects.toThrow(/unknown User "ghost"/)
  })
})
