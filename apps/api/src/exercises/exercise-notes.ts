import { and, eq } from 'drizzle-orm'

import * as schema from '../drizzle/schema'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

type Db = NodePgDatabase<typeof schema>

/** A User's own notes on Exercises (`user_exercise_notes`), keyed by Exercise id. */
export async function loadExerciseNotes(db: Db, userId: string, exerciseId?: string): Promise<Map<string, string>> {
  const t = schema.userExerciseNotes
  const rows = await db
    .select({ exerciseId: t.exerciseId, notes: t.notes })
    .from(t)
    .where(exerciseId ? and(eq(t.userId, userId), eq(t.exerciseId, exerciseId)) : eq(t.userId, userId))
  return new Map(rows.map(r => [r.exerciseId, r.notes]))
}

/** Set a User's notes on an Exercise; blank notes remove the record. */
export async function saveExerciseNotes(db: Db, userId: string, exerciseId: string, notes: string | null) {
  const t = schema.userExerciseNotes
  const text = notes?.trim() ? notes : null
  if (text === null) {
    await db.delete(t).where(and(eq(t.userId, userId), eq(t.exerciseId, exerciseId)))
    return
  }
  const updatedAt = Math.floor(Date.now() / 1000)
  await db
    .insert(t)
    .values({ userId, exerciseId, notes: text, updatedAt })
    .onConflictDoUpdate({ target: [t.userId, t.exerciseId], set: { notes: text, updatedAt } })
}
