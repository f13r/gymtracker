import { Injectable, Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

/** The one Gym the whole household shares. A fixed id makes creating it twice a no-op. */
export const HOUSEHOLD_GYM_ID = 'household'

@Injectable()
export class GymService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async getOrCreateHousehold(): Promise<typeof schema.gyms.$inferSelect> {
    const byId = eq(schema.gyms.id, HOUSEHOLD_GYM_ID)
    const [existing] = await this.db.select().from(schema.gyms).where(byId).limit(1)
    if (existing) {
      return existing
    }
    await this.db
      .insert(schema.gyms)
      .values({ id: HOUSEHOLD_GYM_ID, name: 'My Gym', createdAt: Math.floor(Date.now() / 1000) })
      .onConflictDoNothing({ target: schema.gyms.id })
    const [gym] = await this.db.select().from(schema.gyms).where(byId).limit(1)
    return gym!
  }
}
