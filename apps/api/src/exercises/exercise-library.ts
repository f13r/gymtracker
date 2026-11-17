import { eq, sql } from 'drizzle-orm'

import type { DbExercise } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

/**
 * Shared Exercise library rules (ADR 0012, CONTEXT.md "Archived Exercise") used by the Exercise
 * endpoints and the Agent's apply. Each takes the database (or a transaction) to work with.
 */
type Db = NodePgDatabase<typeof schema>

/** The Exercise whose name equals `name` ignoring case (the unique `lower(name)` index), archived or not. */
export async function findExerciseByName(db: Db, name: string): Promise<DbExercise | undefined> {
  const [ex] = await db
    .select()
    .from(schema.exercises)
    .where(sql`lower(${schema.exercises.name}) = lower(${name})`)
    .limit(1)
  return ex
}

/** Whether anything (any User's Sets, Session snapshots, Templates, Equipment or Suggestions) uses it. */
export async function isExerciseReferenced(db: Db, id: string): Promise<boolean> {
  const refs = [
    schema.sets.exerciseId,
    schema.templateExercises.exerciseId,
    schema.sessionExercises.exerciseId,
    schema.equipmentExercises.exerciseId,
    schema.progressionSuggestions.exerciseId,
  ]
  for (const col of refs) {
    const [hit] = await db.select({ exerciseId: col }).from(col.table).where(eq(col, id)).limit(1)
    if (hit) {
      return true
    }
  }
  return false
}

export async function setExerciseArchived(db: Db, id: string, archivedAt: number | null) {
  await db.update(schema.exercises).set({ archivedAt }).where(eq(schema.exercises.id, id))
}

/**
 * Remove an Exercise: archived when something still references it, otherwise deleted outright with
 * every User's notes. Its image files are the caller's to unlink (after any transaction commits).
 */
export async function removeExercise(db: Db, existing: DbExercise): Promise<{ archived: boolean }> {
  if (await isExerciseReferenced(db, existing.id)) {
    if (existing.archivedAt == null) {
      await setExerciseArchived(db, existing.id, Math.floor(Date.now() / 1000))
    }
    return { archived: true }
  }
  await db.delete(schema.userExerciseNotes).where(eq(schema.userExerciseNotes.exerciseId, existing.id))
  await db.delete(schema.exercises).where(eq(schema.exercises.id, existing.id))
  return { archived: false }
}
