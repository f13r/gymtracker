import { inArray } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { TrainerLink } from '../auth/auth.config'
import * as schema from '../drizzle/schema'

/**
 * Refuses to boot when `TRAINER_LINKS` names an id that is not a User, so a typo cannot silently
 * leave a Trainer without access. Throws for the first unknown id, in link order.
 */
export async function assertTrainerLinks(db: NodePgDatabase<typeof schema>, links: TrainerLink[]): Promise<void> {
  const ids = [...new Set(links.flatMap(l => [l.trainerId, l.athleteId]))]
  if (!ids.length) {
    return
  }
  const found = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.id, ids))
  const known = new Set(found.map(u => u.id))
  const unknown = ids.find(id => !known.has(id))
  if (unknown !== undefined) {
    throw new Error(`TRAINER_LINKS names unknown User "${unknown}"`)
  }
}
