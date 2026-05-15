import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { eq, and, or, sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateExerciseDto, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'
import type { DbSet } from '../drizzle/mappers'
import { toWorkoutSet } from '../drizzle/mappers'

@Injectable()
export class ExercisesService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  findAll(userId: string) {
    return this.db
      .select()
      .from(schema.exercises)
      .where(or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1)))
  }

  async findOne(id: string, userId: string) {
    const [ex] = await this.db
      .select()
      .from(schema.exercises)
      .where(and(eq(schema.exercises.id, id), or(eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 1))))
      .limit(1)
    if (!ex) {
      throw new NotFoundException('Exercise not found')
    }
    return ex
  }

  async create(userId: string, dto: CreateExerciseDto) {
    const [row] = await this.db
      .insert(schema.exercises)
      .values({
        id: randomUUID(),
        userId,
        name: dto.name,
        category: dto.category ?? null,
        equipment: dto.equipment ?? null,
        notes: dto.notes ?? null,
        isDefault: 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
    return row
  }

  async update(id: string, userId: string, dto: UpdateExerciseDto) {
    await this.findOne(id, userId)
    const patch = Object.fromEntries(Object.entries(dto).map(([k, v]) => [k, v ?? null]))
    const [row] = await this.db
      .update(schema.exercises)
      .set(patch)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId)))
      .returning()
    return row
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId)
    await this.db
      .delete(schema.exercises)
      .where(and(eq(schema.exercises.id, id), eq(schema.exercises.userId, userId), eq(schema.exercises.isDefault, 0)))
  }

  async getLastSets(exerciseId: string, userId: string): Promise<WorkoutSet[]> {
    const result = await this.db.execute(sql`
      SELECT s.id, s.session_id AS "sessionId", s.exercise_id AS "exerciseId",
             s.set_number AS "setNumber", s.reps, s.weight_kg AS "weightKg",
             s.duration_sec AS "durationSec", s.rpe,
             s.completed_at AS "completedAt", s.done
      FROM sets s
      WHERE s.session_id = (
        SELECT ws.id FROM workout_sessions ws
        INNER JOIN sets s2 ON s2.session_id = ws.id
        WHERE ws.user_id = ${userId} AND s2.exercise_id = ${exerciseId} AND ws.finished_at IS NOT NULL
        ORDER BY ws.finished_at DESC LIMIT 1
      ) AND s.exercise_id = ${exerciseId}
      ORDER BY s.set_number ASC
    `)
    return result.rows.map(r => toWorkoutSet(r as DbSet))
  }
}
