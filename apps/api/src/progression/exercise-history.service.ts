import { Injectable, Inject } from '@nestjs/common'
import { eq, and, sql } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { doneSetFilter, volumeSumSql } from '../drizzle/set-queries'

/**
 * A structured, typed view of an Exercise's recent training history — the data
 * behind a Progression Suggestion's `evidence`. The coaching rules (two-for-two
 * progression, category weekly-set load) are computed here behind a testable
 * interface, separate from prompt assembly.
 */
export type ExerciseContext = {
  exerciseId: string
  name: string
  category: string | null
  lastSets: { setNumber: number; weightKg: number | null; reps: number | null; rpe: number | null }[]
  prWeightKg: number | null
  prReps: number | null
  weeklyVolumes: { week: string; volume: number }[]
  weeklyFrequency: number
  sessionCount: number
  lastTwoSessions: { weightKg: number | null; reps: number | null }[]
  categoryWeeklySetCount: number
  hoursSinceCategorySession: number | null
  consecutiveWeeksActive: number
}

@Injectable()
export class ExerciseHistoryService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  /**
   * Gathers the full training-history view for one exercise: the current
   * session's done sets, all-time PR, 4-week volume trend, weekly frequency,
   * total session count, last-two-sessions top sets (two-for-two), and the
   * category weekly-set load. Returns null if the exercise does not exist.
   */
  async buildExerciseContext(
    exerciseId: string,
    userId: string,
    sessionId: string,
  ): Promise<ExerciseContext | null> {
    const [exercise] = await this.db
      .select({ name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId))
      .limit(1)
    if (!exercise) {
      return null
    }

    const sessionSets = await this.db
      .select({
        setNumber: schema.sets.setNumber,
        weightKg: schema.sets.weightKg,
        reps: schema.sets.reps,
        rpe: schema.sets.rpe,
      })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), eq(schema.sets.exerciseId, exerciseId), doneSetFilter))
      .orderBy(schema.sets.setNumber)

    const prResult = await this.db.execute(sql`
      SELECT s.weight_kg AS "weightKg", s.reps
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId} AND s.done = 1
        AND ws.finished_at IS NOT NULL
      ORDER BY s.weight_kg DESC NULLS LAST
      LIMIT 1
    `)
    const pr = prResult.rows[0] as { weightKg: number | null; reps: number | null } | undefined

    const volumeResult = await this.db.execute(sql`
      SELECT
        to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week,
        ${volumeSumSql} AS volume
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId}
        AND s.exercise_id = ${exerciseId}
        AND s.done = 1
        AND s.completed_at > extract(epoch from now() - interval '4 weeks')
      GROUP BY week
      ORDER BY week
    `)

    const freqResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT to_char(to_timestamp(started_at), 'IYYY-"W"IW')) AS weeks_active
      FROM workout_sessions
      WHERE user_id = ${userId}
        AND finished_at IS NOT NULL
        AND started_at > extract(epoch from now() - interval '4 weeks')
    `)
    const weeklyFrequency = Number((freqResult.rows[0] as { weeks_active: string })?.weeks_active ?? 0)

    const sessionCountResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT s.session_id) AS cnt
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
    `)
    const sessionCount = Number((sessionCountResult.rows[0] as { cnt: string })?.cnt ?? 0)

    const lastTwoResult = await this.db.execute(sql`
      SELECT s.weight_kg AS "weightKg", s.reps
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
        AND ws.id != ${sessionId}
      ORDER BY ws.finished_at DESC NULLS LAST, s.weight_kg DESC NULLS LAST
      LIMIT 2
    `)
    const lastTwoSessions = lastTwoResult.rows as { weightKg: number | null; reps: number | null }[]

    const catSetsResult = await this.db.execute(sql`
      SELECT AVG(weekly_sets) AS avg_sets
      FROM (
        SELECT to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week,
               COUNT(*) AS weekly_sets
        FROM sets s
        JOIN workout_sessions ws ON ws.id = s.session_id
        JOIN exercises e ON e.id = s.exercise_id
        WHERE ws.user_id = ${userId} AND e.category = ${exercise.category}
          AND s.done = 1
          AND s.completed_at > extract(epoch from now() - interval '4 weeks')
        GROUP BY week
      ) t
    `)
    const categoryWeeklySetCount = Math.round(Number((catSetsResult.rows[0] as { avg_sets: string })?.avg_sets ?? 0))

    const catLastResult = await this.db.execute(sql`
      SELECT MAX(ws.finished_at) AS last_at
      FROM workout_sessions ws
      JOIN sets s ON s.session_id = ws.id
      JOIN exercises e ON e.id = s.exercise_id
      WHERE ws.user_id = ${userId} AND e.category = ${exercise.category}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
        AND ws.id != ${sessionId}
    `)
    const lastCatAt = (catLastResult.rows[0] as { last_at: number | null })?.last_at
    const hoursSinceCategorySession = lastCatAt
      ? Math.round((Date.now() / 1000 - lastCatAt) / 3600)
      : null

    const consWeeksResult = await this.db.execute(sql`
      WITH weekly AS (
        SELECT DISTINCT to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week
        FROM sets s
        JOIN workout_sessions ws ON ws.id = s.session_id
        WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
          AND s.done = 1 AND ws.finished_at IS NOT NULL
        ORDER BY week DESC
      ),
      ranked AS (
        SELECT week,
               ROW_NUMBER() OVER (ORDER BY week DESC) AS rn,
               to_char(
                 (SELECT MAX(to_timestamp(s2.completed_at))
                  FROM sets s2 JOIN workout_sessions ws2 ON ws2.id = s2.session_id
                  WHERE ws2.user_id = ${userId} AND s2.exercise_id = ${exerciseId} AND s2.done = 1)
                 - (rn - 1) * interval '1 week',
                 'IYYY-"W"IW'
               ) AS expected_week
        FROM weekly
      )
      SELECT COUNT(*) AS consecutive
      FROM ranked
      WHERE week = expected_week
    `)
    const consecutiveWeeksActive = Number((consWeeksResult.rows[0] as { consecutive: string })?.consecutive ?? 1)

    return {
      exerciseId,
      name: exercise.name,
      category: exercise.category,
      lastSets: sessionSets,
      prWeightKg: pr?.weightKg ?? null,
      prReps: pr?.reps ?? null,
      weeklyVolumes: (volumeResult.rows as { week: string; volume: string }[]).map(r => ({
        week: r.week,
        volume: Number(r.volume),
      })),
      weeklyFrequency,
      sessionCount,
      lastTwoSessions,
      categoryWeeklySetCount,
      hoursSinceCategorySession,
      consecutiveWeeksActive,
    }
  }
}
