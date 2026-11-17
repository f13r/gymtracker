import { ConflictException } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

/**
 * Template writes shared by the Template endpoints and the Agent's apply. Each takes the database
 * (or a transaction) to write with, so a caller can run several of them atomically.
 */
type Db = NodePgDatabase<typeof schema>

export type TemplateExerciseInput = {
  exerciseId: string
  orderIndex: number
  defaultSets?: number | null | undefined
  defaultReps?: number | null | undefined
  defaultWeightKg?: number | null | undefined
  equipmentId?: string | null | undefined
  supersetGroup?: string | null | undefined
}

/** The User's Template whose name equals `name` ignoring case (unique per User), if any. */
export async function findTemplateByName(db: Db, userId: string, name: string) {
  const t = schema.workoutTemplates
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.userId, userId), sql`lower(${t.name}) = lower(${name})`))
    .limit(1)
  return row
}

/** 409 unless `name` is free among the User's Templates (or taken by `selfId` itself). */
export async function assertTemplateNameFree(db: Db, userId: string, name: string, selfId?: string) {
  const clash = await findTemplateByName(db, userId, name)
  if (clash && clash.id !== selfId) {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: `A template named "${clash.name}" already exists`,
      templateId: clash.id,
    })
  }
}

/** Replace a Template's whole exercise list (ADR 0007: the Template row keeps its id). */
export async function replaceTemplateExercises(db: Db, templateId: string, exercises: TemplateExerciseInput[]) {
  await db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, templateId))
  for (const ex of exercises) {
    await db.insert(schema.templateExercises).values({
      id: randomUUID(),
      templateId,
      exerciseId: ex.exerciseId,
      orderIndex: ex.orderIndex,
      defaultSets: ex.defaultSets ?? null,
      defaultReps: ex.defaultReps ?? null,
      defaultWeightKg: ex.defaultWeightKg ?? null,
      equipmentId: ex.equipmentId ?? null,
      supersetGroup: ex.supersetGroup ?? null,
    })
  }
}

/**
 * Delete a User's Template with what hangs off it: its Program Phase links and Schedules go, its
 * past Sessions keep their history but lose the link.
 */
export async function deleteTemplateCascade(db: Db, id: string, userId: string) {
  await db.delete(schema.programPhaseTemplates).where(eq(schema.programPhaseTemplates.templateId, id))
  await db.delete(schema.workoutSchedules).where(eq(schema.workoutSchedules.templateId, id))
  await db.update(schema.workoutSessions).set({ templateId: null }).where(eq(schema.workoutSessions.templateId, id))
  await db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id))
  await db
    .delete(schema.workoutTemplates)
    .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
}
