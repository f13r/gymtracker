import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { CreateTemplateDto, FinishSessionDto, StartSessionDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

@Injectable()
export class WorkoutsService {
  constructor(@Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>) {}

  getTemplates(userId: string) {
    const templates = this.db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.userId, userId))
      .orderBy(desc(schema.workoutTemplates.createdAt))
      .all()
    return templates.map(t => ({
      ...t,
      exercises: this.db
        .select()
        .from(schema.templateExercises)
        .where(eq(schema.templateExercises.templateId, t.id))
        .all(),
    }))
  }

  getTemplate(id: string, userId: string) {
    const t = this.db
      .select()
      .from(schema.workoutTemplates)
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
      .get()
    if (!t) {
      throw new NotFoundException('Template not found')
    }
    const exercises = this.db
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, id))
      .all()
    return { ...t, exercises }
  }

  createTemplate(userId: string, dto: CreateTemplateDto) {
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    this.db
      .insert(schema.workoutTemplates)
      .values({ id, userId, name: dto.name, notes: dto.notes ?? null, createdAt: now })
      .run()
    for (const ex of dto.exercises) {
      this.db
        .insert(schema.templateExercises)
        .values({
          id: randomUUID(),
          templateId: id,
          ...ex,
          defaultWeightKg: ex.defaultWeightKg ?? null,
          defaultSets: ex.defaultSets ?? null,
          defaultReps: ex.defaultReps ?? null,
          isWarmup: ex.isWarmup ? 1 : 0,
        })
        .run()
    }
    return this.getTemplate(id, userId)
  }

  deleteTemplate(id: string, userId: string) {
    this.getTemplate(id, userId)
    this.db.delete(schema.workoutSchedules).where(eq(schema.workoutSchedules.templateId, id)).run()
    this.db
      .update(schema.workoutSessions)
      .set({ templateId: null })
      .where(eq(schema.workoutSessions.templateId, id))
      .run()
    this.db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id)).run()
    this.db
      .delete(schema.workoutTemplates)
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
      .run()
  }

  getSessions(userId: string) {
    return this.db
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.startedAt))
      .all()
  }

  getSession(id: string, userId: string) {
    const s = this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .get()
    if (!s) {
      throw new NotFoundException('Session not found')
    }
    const sessionSets = this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, id)).all()
    return { ...s, sets: sessionSets }
  }

  getActiveSession(userId: string) {
    return (
      this.db
        .select()
        .from(schema.workoutSessions)
        .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.finishedAt)))
        .get() ?? null
    )
  }

  startSession(userId: string, dto: StartSessionDto) {
    const active = this.getActiveSession(userId)
    if (active) {
      throw new BadRequestException('A session is already active')
    }
    const id = randomUUID()
    this.db
      .insert(schema.workoutSessions)
      .values({
        id,
        userId,
        templateId: dto.templateId ?? null,
        name: dto.name,
        startedAt: Math.floor(Date.now() / 1000),
        finishedAt: null,
        notes: null,
      })
      .run()
    return this.getSession(id, userId)
  }

  finishSession(id: string, userId: string, dto: FinishSessionDto) {
    this.getSession(id, userId)
    this.db
      .update(schema.workoutSessions)
      .set({ finishedAt: Math.floor(Date.now() / 1000), notes: dto.notes ?? null })
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .run()
    return this.getSession(id, userId)
  }

  deleteSession(id: string, userId: string) {
    this.getSession(id, userId)
    this.db.delete(schema.sets).where(eq(schema.sets.sessionId, id)).run()
    this.db
      .delete(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .run()
  }
}
