import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or, gte, lt, count } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateScheduleDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { randomUUID } from 'crypto'

@Injectable()
export class SchedulesService {
  constructor(@Inject(DATABASE) private db: NodePgDatabase<typeof schema>) {}

  getSchedules(userId: string) {
    return this.db.select().from(schema.workoutSchedules).where(eq(schema.workoutSchedules.userId, userId))
  }

  async createSchedule(userId: string, dto: CreateScheduleDto) {
    if (dto.type === 'once' && !dto.scheduledDate) {
      throw new BadRequestException('scheduledDate is required for one-time schedules')
    }
    if (dto.type === 'weekly' && dto.dayOfWeek === undefined) {
      throw new BadRequestException('dayOfWeek is required for weekly schedules')
    }
    const [row] = await this.db
      .insert(schema.workoutSchedules)
      .values({
        id: randomUUID(),
        userId,
        templateId: dto.templateId,
        type: dto.type,
        scheduledDate: dto.scheduledDate ?? null,
        dayOfWeek: dto.dayOfWeek ?? null,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning()
    return row
  }

  async deleteSchedule(id: string, userId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.id, id), eq(schema.workoutSchedules.userId, userId)))
      .limit(1)
    if (!existing) {
      throw new NotFoundException('Schedule not found')
    }
    await this.db
      .delete(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.id, id), eq(schema.workoutSchedules.userId, userId)))
  }

  async getTodaySchedule(userId: string) {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const dayOfWeek = now.getDay()

    const [match] = await this.db
      .select()
      .from(schema.workoutSchedules)
      .where(
        and(
          eq(schema.workoutSchedules.userId, userId),
          or(
            and(eq(schema.workoutSchedules.type, 'once'), eq(schema.workoutSchedules.scheduledDate, today)),
            and(eq(schema.workoutSchedules.type, 'weekly'), eq(schema.workoutSchedules.dayOfWeek, dayOfWeek)),
          ),
        ),
      )
      .limit(1)

    if (!match) {
      return null
    }

    const startOfDay = Math.floor(new Date(today).getTime() / 1000)
    const endOfDay = startOfDay + 86400
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          eq(schema.workoutSessions.templateId, match.templateId!),
          gte(schema.workoutSessions.startedAt, startOfDay),
          lt(schema.workoutSessions.startedAt, endOfDay),
        ),
      )
    if (result && result.count > 0) {
      return null
    }

    const [template] = await this.db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.id, match.templateId!))
      .limit(1)

    const exercises = await this.db
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, match.templateId!))

    return {
      schedule: match,
      templateName: template?.name ?? 'Workout',
      exerciseCount: exercises.length,
    }
  }
}
