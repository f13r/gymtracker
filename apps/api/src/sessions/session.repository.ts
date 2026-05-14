import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, isNull } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { WorkoutSession } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { toWorkoutSession } from '../drizzle/mappers'

type DrizzleDB = BetterSQLite3Database<typeof schema>

@Injectable()
export class SessionRepository {
  constructor(@Inject(DATABASE) private db: DrizzleDB) {}

  // Finds THE active session (finishedAt IS NULL) for a user. Returns null if none.
  findActive(userId: string): WorkoutSession | null {
    const row = this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.finishedAt)))
      .get()
    return row ? toWorkoutSession(row) : null
  }

  // Loads a specific session by ID+userId. Throws NotFoundException if absent.
  findById(id: string, userId: string): WorkoutSession {
    const row = this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .get()
    if (!row) throw new NotFoundException('Session not found')
    return toWorkoutSession(row)
  }

  // findById + throws BadRequestException if the session is already finished.
  assertActive(id: string, userId: string): WorkoutSession {
    const session = this.findById(id, userId)
    if (session.finishedAt !== null) throw new BadRequestException('Session is already finished')
    return session
  }
}
