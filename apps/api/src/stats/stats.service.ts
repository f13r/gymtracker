import { Injectable, Inject } from '@nestjs/common'
import { eq, and, gte, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>

@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private db: DrizzleDB) {}

  private raw() {
    return this.db.$client
  }

  getPRs(userId: string, exerciseId?: string, limit = 10) {
    const where = exerciseId ? `AND s.exercise_id = '${exerciseId.replace(/'/g, "''")}'` : ''
    return this.raw()
      .prepare(
        `
      SELECT s.exercise_id, e.name, MAX(s.weight_kg) as maxWeightKg,
             s.reps as repsAtMax, s.completed_at as achievedAt
      FROM sets s
      JOIN workout_sessions ws ON s.session_id = ws.id
      JOIN exercises e ON s.exercise_id = e.id
      WHERE ws.user_id = ? AND s.is_warmup = 0 ${where}
      GROUP BY s.exercise_id
      ORDER BY maxWeightKg DESC
      LIMIT ?
    `,
      )
      .all(userId, limit)
  }

  getVolume(userId: string, exerciseId?: string, from?: number, to?: number) {
    const conditions: string[] = ['ws.user_id = ?']
    const params: unknown[] = [userId]
    if (exerciseId) {
      conditions.push(`s.exercise_id = ?`)
      params.push(exerciseId)
    }
    if (from) {
      conditions.push(`s.completed_at >= ?`)
      params.push(from)
    }
    if (to) {
      conditions.push(`s.completed_at <= ?`)
      params.push(to)
    }
    const where = conditions.join(' AND ')
    return this.raw()
      .prepare(
        `
      SELECT date(s.completed_at, 'unixepoch') as date,
             SUM(s.reps * s.weight_kg) as volume
      FROM sets s
      JOIN workout_sessions ws ON s.session_id = ws.id
      WHERE ${where} AND s.reps IS NOT NULL AND s.weight_kg IS NOT NULL
      GROUP BY date ORDER BY date ASC
    `,
      )
      .all(...params)
  }

  getStreak(userId: string) {
    const days = this.raw()
      .prepare(
        `
      SELECT DISTINCT date(started_at, 'unixepoch') as day
      FROM workout_sessions WHERE user_id = ? AND finished_at IS NOT NULL
      ORDER BY day DESC
    `,
      )
      .all(userId) as { day: string }[]

    let current = 0,
      longest = 0,
      streak = 0
    const today = new Date().toISOString().split('T')[0]!
    let prev: string | null = null

    for (const { day } of days) {
      if (!prev) {
        streak = day === today || day === new Date(Date.now() - 86400000).toISOString().split('T')[0] ? 1 : 0
      } else {
        const diff = (new Date(prev).getTime() - new Date(day).getTime()) / 86400000
        streak = diff === 1 ? streak + 1 : 1
      }
      longest = Math.max(longest, streak)
      if (!current) {
        current = streak
      }
      prev = day
    }
    return { current, longest }
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

  getFrequency(userId: string, from?: number, to?: number) {
    const params: unknown[] = [userId]
    let extra = ''
    if (from) {
      extra += ' AND started_at >= ?'
      params.push(from)
    }
    if (to) {
      extra += ' AND started_at <= ?'
      params.push(to)
    }
    return this.raw()
      .prepare(
        `
      SELECT strftime('%Y-W%W', started_at, 'unixepoch') as week, COUNT(*) as count
      FROM workout_sessions WHERE user_id = ? AND finished_at IS NOT NULL ${extra}
      GROUP BY week ORDER BY week ASC
    `,
      )
      .all(...params)
  }
}
