import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { CreateScheduleDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { SessionRepository } from '../sessions/session.repository'
import { randomUUID } from 'crypto'

@Injectable()
export class SchedulesService {
  constructor(
    @Inject(DATABASE) private db: BetterSQLite3Database<typeof schema>,
    private sessions: SessionRepository,
  ) {}

  getSchedules(userId: string) {
    return this.db.select().from(schema.workoutSchedules).where(eq(schema.workoutSchedules.userId, userId)).all()
  }

  createSchedule(userId: string, dto: CreateScheduleDto) {
    if (dto.type === 'once' && !dto.scheduledDate) {
      throw new BadRequestException('scheduledDate is required for one-time schedules')
    }
    if (dto.type === 'weekly' && dto.dayOfWeek === undefined) {
      throw new BadRequestException('dayOfWeek is required for weekly schedules')
    }
    const id = randomUUID()
    this.db
      .insert(schema.workoutSchedules)
      .values({
        id,
        userId,
        templateId: dto.templateId,
        type: dto.type,
        scheduledDate: dto.scheduledDate ?? null,
        dayOfWeek: dto.dayOfWeek ?? null,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .run()
    return this.db.select().from(schema.workoutSchedules).where(eq(schema.workoutSchedules.id, id)).get()
  }

  deleteSchedule(id: string, userId: string) {
    const existing = this.db
      .select()
      .from(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.id, id), eq(schema.workoutSchedules.userId, userId)))
      .get()
    if (!existing) {
      throw new NotFoundException('Schedule not found')
    }
    this.db
      .delete(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.id, id), eq(schema.workoutSchedules.userId, userId)))
      .run()
  }

  getTodaySchedule(userId: string) {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const dayOfWeek = now.getDay()

    const schedules = this.db
      .select()
      .from(schema.workoutSchedules)
      .where(eq(schema.workoutSchedules.userId, userId))
      .all()

    const match = schedules.find(s => {
      if (s.type === 'once') {return s.scheduledDate === today}
      if (s.type === 'weekly') {return s.dayOfWeek === dayOfWeek}
      return false
    })

    if (!match) {return null}

    // Check if user already has an active session for this template
    const activeSession = this.sessions.findActive(userId)
    if (activeSession && activeSession.templateId === match.templateId) {return null}

    const template = this.db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.id, match.templateId!))
      .get()

    const exerciseCount = this.db
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, match.templateId!))
      .all().length

    return {
      schedule: match,
      templateName: template?.name ?? 'Workout',
      exerciseCount,
    }
  }
}
