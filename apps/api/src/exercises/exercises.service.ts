import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, or } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'
import type { DbSet } from '../drizzle/mappers'
import { toWorkoutSet } from '../drizzle/mappers'

@Injectable()
export class ExercisesService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  findAll(userId: string) {
    return this.db
      .select()
      .from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))
      .all()
  }

  findOne(id: string, userId: string) {
    const ex = this.db
      .select()
      .from(schema.exercises)
      .where(
        and(eq(schema.exercises.id, id), or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1))),
      )
      .get()
    if (!ex) {
      throw new NotFoundException('Exercise not found')
    }
    return ex
  }

  create(userId: string, dto: CreateExerciseDto) {
    const id = randomUUID()
    this.db
      .insert(schema.exercises)
      .values({
        id,
        userId,
        name: dto.name,
        category: dto.category ?? null,
        equipment: dto.equipment ?? null,
        notes: dto.notes ?? null,
        isDefault: 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .run()
    return this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()!
  }

  update(id: string, userId: string, dto: UpdateExerciseDto) {
    this.findOne(id, userId)
    const patch = Object.fromEntries(Object.entries(dto).map(([k, v]) => [k, v ?? null]))
    this.db
      .update(schema.exercises)
      .set(patch)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
      .run()
    return this.db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()!
  }

  remove(id: string, userId: string) {
    this.findOne(id, userId)
    this.db
      .delete(schema.exercises)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 0)))
      .run()
  }

  getLastSets(exerciseId: string, userId: string): WorkoutSet[] {
    const raw = (this.db as unknown as { $client: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } } }).$client
    const rows = raw.prepare(`
      SELECT s.id, s.session_id AS sessionId, s.exercise_id AS exerciseId,
             s.set_number AS setNumber, s.reps, s.weight_kg AS weightKg,
             s.duration_sec AS durationSec, s.rpe,
             s.completed_at AS completedAt, s.done
      FROM sets s
      WHERE s.session_id = (
        SELECT ws.id FROM workout_sessions ws
        INNER JOIN sets s2 ON s2.session_id = ws.id
        WHERE ws.user_id = ? AND s2.exercise_id = ? AND ws.finished_at IS NOT NULL
        ORDER BY ws.finished_at DESC LIMIT 1
      ) AND s.exercise_id = ?
      ORDER BY s.set_number ASC
    `).all(userId, exerciseId, exerciseId)
    return rows.map(r => toWorkoutSet(r as DbSet))
  }
}
