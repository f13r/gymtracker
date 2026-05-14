import type { WorkoutSet, WorkoutSession } from '@gymtracker/shared'
import type * as schema from './schema'

export type DbSet = typeof schema.sets.$inferSelect
export type DbSession = typeof schema.workoutSessions.$inferSelect

export function toWorkoutSet(row: DbSet): WorkoutSet {
  return {
    id: row.id,
    // sessionId and exerciseId are always set by the application; schema allows null for SQLite compatibility
    sessionId: row.sessionId!,
    exerciseId: row.exerciseId!,
    setNumber: row.setNumber,
    reps: row.reps,
    weightKg: row.weightKg,
    durationSec: row.durationSec,
    rpe: row.rpe,
    completedAt: row.completedAt,
    done: row.done === 1,
  }
}

export function toWorkoutSession(row: DbSession): WorkoutSession {
  return {
    id: row.id,
    // userId is always set; schema allows null for SQLite compatibility
    userId: row.userId!,
    templateId: row.templateId,
    name: row.name,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    notes: row.notes,
  }
}
