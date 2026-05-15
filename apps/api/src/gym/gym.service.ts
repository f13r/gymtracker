import { Injectable, Inject } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

@Injectable()
export class GymService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  async getOrCreateForUser(userId: string): Promise<typeof schema.gyms.$inferSelect> {
    const [existing] = await this.db
      .select()
      .from(schema.gyms)
      .where(eq(schema.gyms.userId, userId))
      .limit(1)
    if (existing) return existing
    await this.db
      .insert(schema.gyms)
      .values({ id: randomUUID(), userId, name: 'My Gym', createdAt: Math.floor(Date.now() / 1000) })
      .onConflictDoNothing()
    const [gym] = await this.db
      .select()
      .from(schema.gyms)
      .where(eq(schema.gyms.userId, userId))
      .limit(1)
    return gym!
  }
}
