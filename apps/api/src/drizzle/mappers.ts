import type {
  WorkoutSet,
  WorkoutSession,
  SessionExercise,
  Equipment,
  EquipmentWithExercises,
  Exercise,
} from '@gymtracker/shared'

import * as schema from './schema'

export type DbExercise = typeof schema.exercises.$inferSelect

// Map a stored Exercise to the wire model: expose a `hasImage` flag instead of the on-disk paths
// (and never leak the legacy wger_id).
export function toExercise(row: DbExercise): Exercise {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    category: row.category,
    equipmentType: row.equipmentType,
    notes: row.notes,
    isDefault: row.isDefault,
    description: row.description,
    hasImage: row.imagePath != null,
    createdAt: row.createdAt,
  }
}

export type DbSet = typeof schema.sets.$inferSelect
export type DbSession = typeof schema.workoutSessions.$inferSelect
export type DbSessionExercise = typeof schema.sessionExercises.$inferSelect

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
    removedAt: row.removedAt,
    notes: row.notes,
  }
}

export function toSessionExercise(row: DbSessionExercise): SessionExercise {
  return {
    id: row.id,
    sessionId: row.sessionId!,
    exerciseId: row.exerciseId!,
    orderIndex: row.orderIndex,
    equipmentId: row.equipmentId,
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

export type DbEquipment = typeof schema.equipment.$inferSelect

export function toEquipment(row: DbEquipment): Equipment {
  return {
    id: row.id,
    gymId: row.gymId,
    name: row.name,
    equipmentType: row.equipmentType,
    description: row.description,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : null,
    photoPath: row.photoPath,
    thumbPath: row.thumbPath,
    createdAt: row.createdAt,
  }
}

export function toEquipmentWithExercises(row: DbEquipment, exercises: DbExercise[]): EquipmentWithExercises {
  return { ...toEquipment(row), exercises: exercises.map(toExercise) }
}
