import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { CreateSetDto, UpdateSetDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { toWorkoutSet } from '../drizzle/mappers'
import { SessionRepository } from '../sessions/session.repository'
import { randomUUID } from 'crypto'

@Injectable()
export class SetsService {
  constructor(
    @Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>,
    private sessions: SessionRepository,
  ) {}

  getSessionSets(sessionId: string, userId: string) {
    this.sessions.assertActive(sessionId, userId)
    return this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, sessionId)).all().map(toWorkoutSet)
  }

  logSet(sessionId: string, userId: string, dto: CreateSetDto) {
    this.sessions.assertActive(sessionId, userId)
    const id = randomUUID()
    this.db
      .insert(schema.sets)
      .values({
        id,
        sessionId,
        exerciseId: dto.exerciseId,
        setNumber: dto.setNumber,
        reps: dto.reps ?? null,
        weightKg: dto.weightKg ?? null,
        durationSec: dto.durationSec ?? null,
        rpe: dto.rpe ?? null,
        done: dto.done ? 1 : 0,
        completedAt: Math.floor(Date.now() / 1000),
      })
      .run()
    return toWorkoutSet(this.db.select().from(schema.sets).where(eq(schema.sets.id, id)).get()!)
  }

  updateSet(sessionId: string, setId: string, userId: string, dto: UpdateSetDto) {
    this.sessions.assertActive(sessionId, userId)
    const set = this.db
      .select()
      .from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId)))
      .get()
    if (!set) {
      throw new NotFoundException('Set not found')
    }
    const patch = Object.fromEntries(
      Object.entries(dto).map(([k, v]) => [k, k === 'done' ? (v ? 1 : 0) : (v ?? null)]),
    )
    this.db.update(schema.sets).set(patch).where(eq(schema.sets.id, setId)).run()
    return toWorkoutSet(this.db.select().from(schema.sets).where(eq(schema.sets.id, setId)).get()!)
  }

  deleteSet(sessionId: string, setId: string, userId: string) {
    this.sessions.assertActive(sessionId, userId)
    const set = this.db
      .select()
      .from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId)))
      .get()
    if (!set) {
      throw new NotFoundException('Set not found')
    }
    this.db.delete(schema.sets).where(eq(schema.sets.id, setId)).run()
  }
}
