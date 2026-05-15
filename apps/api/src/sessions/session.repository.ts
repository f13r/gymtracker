import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, isNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { WorkoutSession } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import { toWorkoutSession } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'

type DrizzleDB = NodePgDatabase<typeof schema>

@Injectable()
export class SessionRepository {
  constructor(@Inject(DATABASE) private db: DrizzleDB) {}

  async findActive(userId: string): Promise<WorkoutSession | null> {
    const [row] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.finishedAt)))
      .limit(1)
    return row ? toWorkoutSession(row) : null
  }

  async findById(id: string, userId: string): Promise<WorkoutSession> {
    const [row] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .limit(1)
    if (!row) {
      throw new NotFoundException('Session not found')
    }
    return toWorkoutSession(row)
  }

  async assertActive(id: string, userId: string): Promise<WorkoutSession> {
    const session = await this.findById(id, userId)
    if (session.finishedAt !== null) {
      throw new BadRequestException('Session is already finished')
    }
    return session
  }
}
