import { Controller, Get, Inject, Req } from '@nestjs/common'
import { eq, or } from 'drizzle-orm'


import type { AuthUser, Me } from '@gymtracker/shared'

import { AUTH_CONFIG, type AuthConfig, athletesOf, trainersOf } from './auth.config'
import { AuthenticatedRequest } from './request.types'
import { TrainerAccess } from './trainer-access.decorator'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

/**
 * The signed-in person, even while acting as an athlete: the SPA needs their own name and the
 * athletes and Trainers they are linked to. It also drops cached data when the User changes.
 */
@Controller('me')
export class MeController {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @TrainerAccess('read')
  @Get()
  async me(@Req() req: AuthenticatedRequest): Promise<Me> {
    const self = req.actor ?? req.user
    const [athletes, trainers] = await Promise.all([
      this.named(athletesOf(this.config, self.id)),
      this.named(trainersOf(this.config, self.id)),
    ])
    return { id: self.id, displayName: self.displayName, athletes, trainers }
  }

  /** Names for linked ids, sorted by name. A linked id with no User row is left out. */
  private async named(ids: string[]): Promise<AuthUser[]> {
    const [first, ...rest] = ids
    if (first === undefined) {
      return []
    }
    const rows = await this.db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(or(eq(schema.users.id, first), ...rest.map(id => eq(schema.users.id, id))))
    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }
}
