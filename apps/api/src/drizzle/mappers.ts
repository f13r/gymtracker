import type {
  WorkoutSet,
  WorkoutSession,
  SessionExercise,
  Equipment,
  EquipmentWithExercises,
  Exercise,
  ProgressPhoto,
} from '@gymtracker/shared'

import * as schema from './schema'

export type DbExercise = typeof schema.exercises.$inferSelect

// Map a stored Exercise to the wire model: expose a `hasImage` flag instead of the on-disk paths
// (and never leak the legacy wger_id). `notes` are the requesting User's, from user_exercise_notes.
export function toExercise(row: DbExercise, notes: string | null): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    equipmentType: row.equipmentType,
    notes,
    description: row.description,
    archived: row.archivedAt != null,
    hasImage: row.imagePath != null,
    createdAt: row.createdAt,
  }
}

export type DbProgressPhoto = typeof schema.progressPhotos.$inferSelect

// Map a stored progress photo to the wire model: the client fetches the image by id, so the
// on-disk paths are never sent.
export function toProgressPhoto(row: DbProgressPhoto): ProgressPhoto {
  return {
    id: row.id,
    userId: row.userId,
    recordedAt: row.recordedAt,
    bodyWeight: row.bodyWeight,
    tags: row.tags,
    notes: row.notes,
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
    supersetGroup: row.supersetGroup,
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
    createdAt: row.createdAt,
  }
}

// `notes` maps Exercise id → the requesting User's notes.
export function toEquipmentWithExercises(
  row: DbEquipment,
  exercises: DbExercise[],
  notes: ReadonlyMap<string, string>,
): EquipmentWithExercises {
  return { ...toEquipment(row), exercises: exercises.map(e => toExercise(e, notes.get(e.id) ?? null)) }
}
