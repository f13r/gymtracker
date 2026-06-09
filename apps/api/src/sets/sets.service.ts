import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateSetDto, UpdateSetDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import { toWorkoutSet } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { SessionRepository } from '../sessions/session.repository'
import { randomUUID } from 'crypto'

@Injectable()
export class SetsService {
  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private sessions: SessionRepository,
  ) {}

  async getSessionSets(sessionId: string, userId: string) {
    await this.sessions.assertActive(sessionId, userId)
    const rows = await this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, sessionId))
    return rows.map(toWorkoutSet)
  }

  async logSet(sessionId: string, userId: string, dto: CreateSetDto) {
    await this.sessions.assertActive(sessionId, userId)
    const [row] = await this.db
      .insert(schema.sets)
      .values({
        id: randomUUID(),
        sessionId,
        exerciseId: dto.exerciseId,
        setNumber: dto.setNumber,
        reps: dto.reps ?? null,
        weightKg: dto.weightKg ?? null,
        durationSec: dto.durationSec ?? null,
        rpe: dto.rpe ?? null,
        done: dto.done ? 1 : 0,
        completedAt: dto.done ? Math.floor(Date.now() / 1000) : null,
      })
      .returning()
    return toWorkoutSet(row!)
  }

  async updateSet(sessionId: string, setId: string, userId: string, dto: UpdateSetDto) {
    await this.sessions.assertActive(sessionId, userId)
    const [set] = await this.db
      .select()
      .from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId)))
      .limit(1)
    if (!set) {
      throw new NotFoundException('Set not found')
    }
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(dto).map(([k, v]) => [k, k === 'done' ? (v ? 1 : 0) : (v ?? null)]),
    )
    if ('done' in dto) {
      patch.completedAt = dto.done ? Math.floor(Date.now() / 1000) : null
    }
    const [updated] = await this.db
      .update(schema.sets)
      .set(patch)
      .where(eq(schema.sets.id, setId))
      .returning()
    return toWorkoutSet(updated!)
  }

  async deleteSet(sessionId: string, setId: string, userId: string) {
    await this.sessions.assertActive(sessionId, userId)
    const [set] = await this.db
      .select()
      .from(schema.sets)
      .where(and(eq(schema.sets.id, setId), eq(schema.sets.sessionId, sessionId)))
      .limit(1)
    if (!set) {
      throw new NotFoundException('Set not found')
    }
    await this.db.delete(schema.sets).where(eq(schema.sets.id, setId))
  }
}
