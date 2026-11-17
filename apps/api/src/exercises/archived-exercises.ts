import { BadRequestException } from '@nestjs/common'
import { inArray } from 'drizzle-orm'

import * as schema from '../drizzle/schema'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

type Db = NodePgDatabase<typeof schema>

/**
 * Refuse to newly reference an Archived Exercise from a Template or a Set. Pass only the ids the
 * write adds: places that already use an Archived Exercise keep working (CONTEXT.md "Archived
 * Exercise"). Unknown ids are left to the foreign keys.
 */
export async function assertNotArchived(db: Db, exerciseIds: Iterable<string>): Promise<void> {
  const [archived] = await findArchived(db, exerciseIds)
  if (archived) {
    throw archivedExercise(archived)
  }
}

export function archivedExercise(ex: { name: string }) {
  return new BadRequestException(`Exercise "${ex.name}" is archived; restore it before using it`)
}

/** The Archived Exercises among `exerciseIds`. */
export async function findArchived(db: Db, exerciseIds: Iterable<string>) {
  const ids = [...new Set(exerciseIds)]
  if (ids.length === 0) {
    return []
  }
  const t = schema.exercises
  const rows = await db.select({ id: t.id, name: t.name, archivedAt: t.archivedAt }).from(t).where(inArray(t.id, ids))
  return rows.filter(r => ids.includes(r.id) && r.archivedAt != null)
}
