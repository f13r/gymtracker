import { Injectable, Inject } from '@nestjs/common'
import { eq, and, gte, lte, sql, isNotNull, count, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { calculateStreak } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import type { VolumePoint, FrequencyPoint, PersonalRecord, WorkoutStreak } from '@gymtracker/shared'

@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async getPRs(userId: string, exerciseId?: string, limit = 10): Promise<PersonalRecord[]> {
    const result = await this.db.execute(sql`
      WITH ranked AS (
        SELECT s.exercise_id, e.name,
               s.weight_kg      AS "maxWeightKg",
               s.reps           AS "repsAtMax",
               s.completed_at   AS "achievedAt",
               ROW_NUMBER() OVER (PARTITION BY s.exercise_id ORDER BY s.weight_kg DESC) AS rn
        FROM sets s
        JOIN workout_sessions ws ON s.session_id = ws.id
        JOIN exercises e ON s.exercise_id = e.id
        WHERE ws.user_id = ${userId} AND s.done = 1
        ${exerciseId ? sql`AND s.exercise_id = ${exerciseId}` : sql``}
      )
      SELECT exercise_id AS "exerciseId", name, "maxWeightKg", "repsAtMax", "achievedAt"
      FROM ranked
      WHERE rn = 1
      ORDER BY "maxWeightKg" DESC
      LIMIT ${limit}
    `)
    return result.rows as PersonalRecord[]
  }

  async getVolume(userId: string, exerciseId?: string, from?: number, to?: number): Promise<VolumePoint[]> {
    const conditions = [
      eq(schema.workoutSessions.userId, userId),
      eq(schema.sets.done, 1),
      isNotNull(schema.sets.reps),
      isNotNull(schema.sets.weightKg),
    ]
    if (exerciseId) conditions.push(eq(schema.sets.exerciseId, exerciseId))
    if (from) conditions.push(gte(schema.sets.completedAt, from))
    if (to) conditions.push(lte(schema.sets.completedAt, to))

    return this.db
      .select({
        date: sql<string>`to_char(to_timestamp(${schema.sets.completedAt}), 'YYYY-MM-DD')`,
        volume: sql<number>`SUM(${schema.sets.reps} * ${schema.sets.weightKg})`,
      })
      .from(schema.sets)
      .innerJoin(schema.workoutSessions, eq(schema.sets.sessionId, schema.workoutSessions.id))
      .where(and(...conditions))
      .groupBy(sql`to_char(to_timestamp(${schema.sets.completedAt}), 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(to_timestamp(${schema.sets.completedAt}), 'YYYY-MM-DD')`)
  }

  async getStreak(userId: string): Promise<WorkoutStreak> {
    const days = await this.db
      .selectDistinct({ day: sql<string>`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'YYYY-MM-DD')` })
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), isNotNull(schema.workoutSessions.finishedAt)))
      .orderBy(desc(sql<string>`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'YYYY-MM-DD')`))
    return calculateStreak(days.map(r => r.day))
  }

  getBodyWeight(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyWeights.userId, userId)]
    if (from) conditions.push(gte(schema.bodyWeights.recordedAt, from))
    if (to) conditions.push(lte(schema.bodyWeights.recordedAt, to))
    return this.db
      .select()
      .from(schema.bodyWeights)
      .where(and(...conditions))
      .orderBy(schema.bodyWeights.recordedAt)
  }

  getMeasurements(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyMeasurements.userId, userId)]
    if (from) conditions.push(gte(schema.bodyMeasurements.recordedAt, from))
    if (to) conditions.push(lte(schema.bodyMeasurements.recordedAt, to))
    return this.db
      .select()
      .from(schema.bodyMeasurements)
      .where(and(...conditions))
      .orderBy(schema.bodyMeasurements.recordedAt)
  }

  async getFrequency(userId: string, from?: number, to?: number): Promise<FrequencyPoint[]> {
    const conditions = [eq(schema.workoutSessions.userId, userId), isNotNull(schema.workoutSessions.finishedAt)]
    if (from) conditions.push(gte(schema.workoutSessions.startedAt, from))
    if (to) conditions.push(lte(schema.workoutSessions.startedAt, to))

    return this.db
      .select({
        week: sql<string>`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'IYYY-"W"IW')`,
        count: count(),
      })
      .from(schema.workoutSessions)
      .where(and(...conditions))
      .groupBy(sql`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'IYYY-"W"IW')`)
      .orderBy(sql`to_char(to_timestamp(${schema.workoutSessions.startedAt}), 'IYYY-"W"IW')`)
  }
}
