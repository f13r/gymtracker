import { Injectable, Inject } from '@nestjs/common'
import { eq, and, gte, lte, sql, isNotNull, count, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { calculateStreak } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import type { VolumePoint, FrequencyPoint, PersonalRecord, WorkoutStreak } from '@gymtracker/shared'

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>

@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private db: DrizzleDB) {}

  private raw() {
    return this.db.$client
  }

  getPRs(userId: string, exerciseId?: string, limit = 10): PersonalRecord[] {
    // raw().prepare() is used here rather than Drizzle because better-sqlite3's
    // .prepare() supports CTEs with window functions; Drizzle .with() is a follow-up
    const exerciseFilter = exerciseId ? `AND s.exercise_id = ?` : ``
    const params: unknown[] = exerciseId ? [userId, exerciseId, limit] : [userId, limit]
    return this.raw()
      .prepare(
        `
        WITH ranked AS (
          SELECT s.exercise_id, e.name,
                 s.weight_kg AS maxWeightKg, s.reps AS repsAtMax, s.completed_at AS achievedAt,
                 ROW_NUMBER() OVER (PARTITION BY s.exercise_id ORDER BY s.weight_kg DESC) AS rn
          FROM sets s
          JOIN workout_sessions ws ON s.session_id = ws.id
          JOIN exercises e ON s.exercise_id = e.id
          WHERE ws.user_id = ? AND s.done = 1 ${exerciseFilter}
        )
        SELECT exercise_id, name, maxWeightKg, repsAtMax, achievedAt
        FROM ranked WHERE rn = 1
        ORDER BY maxWeightKg DESC
        LIMIT ?
      `,
      )
      .all(...params) as PersonalRecord[]
  }

  getVolume(userId: string, exerciseId?: string, from?: number, to?: number): VolumePoint[] {
    const conditions = [
      eq(schema.workoutSessions.userId, userId),
      eq(schema.sets.done, 1),  // only Done Sets count toward volume
      isNotNull(schema.sets.reps),
      isNotNull(schema.sets.weightKg),
    ]
    if (exerciseId) conditions.push(eq(schema.sets.exerciseId, exerciseId))
    if (from) conditions.push(gte(schema.sets.completedAt, from))
    if (to) conditions.push(lte(schema.sets.completedAt, to))

    return this.db
      .select({
        date: sql<string>`date(${schema.sets.completedAt}, 'unixepoch')`,
        volume: sql<number>`SUM(${schema.sets.reps} * ${schema.sets.weightKg})`,
      })
      .from(schema.sets)
      .innerJoin(schema.workoutSessions, eq(schema.sets.sessionId, schema.workoutSessions.id))
      .where(and(...conditions))
      .groupBy(sql`date(${schema.sets.completedAt}, 'unixepoch')`)
      .orderBy(sql`date(${schema.sets.completedAt}, 'unixepoch')`)
      .all() as VolumePoint[]
  }

  getStreak(userId: string): WorkoutStreak {
    const days = this.db
      .selectDistinct({ day: sql<string>`date(${schema.workoutSessions.startedAt}, 'unixepoch')` })
      .from(schema.workoutSessions)
      .where(and(
        eq(schema.workoutSessions.userId, userId),
        isNotNull(schema.workoutSessions.finishedAt),
      ))
      .orderBy(desc(sql<string>`date(${schema.workoutSessions.startedAt}, 'unixepoch')`))
      .all()
    return calculateStreak(days.map(r => r.day))
  }

  getBodyWeight(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyWeights.userId, userId)]
    if (from) {
      conditions.push(gte(schema.bodyWeights.recordedAt, from))
    }
    if (to) {
      conditions.push(lte(schema.bodyWeights.recordedAt, to))
    }
    return this.db
      .select()
      .from(schema.bodyWeights)
      .where(and(...conditions))
      .orderBy(schema.bodyWeights.recordedAt)
      .all()
  }

  getMeasurements(userId: string, from?: number, to?: number) {
    const conditions = [eq(schema.bodyMeasurements.userId, userId)]
    if (from) {
      conditions.push(gte(schema.bodyMeasurements.recordedAt, from))
    }
    if (to) {
      conditions.push(lte(schema.bodyMeasurements.recordedAt, to))
    }
    return this.db
      .select()
      .from(schema.bodyMeasurements)
      .where(and(...conditions))
      .orderBy(schema.bodyMeasurements.recordedAt)
      .all()
  }

  getFrequency(userId: string, from?: number, to?: number): FrequencyPoint[] {
    const conditions = [
      eq(schema.workoutSessions.userId, userId),
      isNotNull(schema.workoutSessions.finishedAt),
    ]
    if (from) conditions.push(gte(schema.workoutSessions.startedAt, from))
    if (to) conditions.push(lte(schema.workoutSessions.startedAt, to))

    return this.db
      .select({
        week: sql<string>`strftime('%Y-W%W', ${schema.workoutSessions.startedAt}, 'unixepoch')`,
        count: count(),
      })
      .from(schema.workoutSessions)
      .where(and(...conditions))
      .groupBy(sql`strftime('%Y-W%W', ${schema.workoutSessions.startedAt}, 'unixepoch')`)
      .orderBy(sql`strftime('%Y-W%W', ${schema.workoutSessions.startedAt}, 'unixepoch')`)
      .all() as FrequencyPoint[]
  }
}
