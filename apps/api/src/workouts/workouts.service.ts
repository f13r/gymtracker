import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { eq, and, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CreateTemplateDto, FinishSessionDto, StartSessionDto } from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { toWorkoutSession, toWorkoutSet } from '../drizzle/mappers'
import { SessionRepository } from '../sessions/session.repository'
import { ProgressionService } from '../progression/progression.service'
import { ProgramService } from '../program/program.service'
import { randomUUID } from 'crypto'

@Injectable()
export class WorkoutsService {
  private readonly logger = new Logger(WorkoutsService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private sessions: SessionRepository,
    private progressionService: ProgressionService,
    private programService: ProgramService,
  ) {}

  async getTemplates(userId: string) {
    const templates = await this.db
      .select()
      .from(schema.workoutTemplates)
      .where(eq(schema.workoutTemplates.userId, userId))
      .orderBy(desc(schema.workoutTemplates.createdAt))
    return Promise.all(
      templates.map(async t => ({
        ...t,
        exercises: await this.db
          .select()
          .from(schema.templateExercises)
          .where(eq(schema.templateExercises.templateId, t.id)),
      })),
    )
  }

  async getTemplate(id: string, userId: string) {
    const [t] = await this.db
      .select()
      .from(schema.workoutTemplates)
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
      .limit(1)
    if (!t) {
      throw new NotFoundException('Template not found')
    }
    const exercises = await this.db
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, id))
    return { ...t, exercises }
  }

  async createTemplate(userId: string, dto: CreateTemplateDto) {
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .insert(schema.workoutTemplates)
      .values({ id, userId, name: dto.name, notes: dto.notes ?? null, createdAt: now })
    for (const ex of dto.exercises) {
      await this.db
        .insert(schema.templateExercises)
        .values({
          id: randomUUID(),
          templateId: id,
          ...ex,
          defaultWeightKg: ex.defaultWeightKg ?? null,
          defaultSets: ex.defaultSets ?? null,
          defaultReps: ex.defaultReps ?? null,
        })
    }
    return this.getTemplate(id, userId)
  }

  async deleteTemplate(id: string, userId: string) {
    await this.getTemplate(id, userId)
    await this.db.delete(schema.programPhaseTemplates).where(eq(schema.programPhaseTemplates.templateId, id))
    await this.db.delete(schema.workoutSchedules).where(eq(schema.workoutSchedules.templateId, id))
    await this.db.update(schema.workoutSessions).set({ templateId: null }).where(eq(schema.workoutSessions.templateId, id))
    await this.db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id))
    await this.db.delete(schema.workoutTemplates).where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
  }

  async getSessions(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.startedAt))
    return rows.map(toWorkoutSession)
  }

  async getSession(id: string, userId: string) {
    const [s] = await this.db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .limit(1)
    if (!s) {
      throw new NotFoundException('Session not found')
    }
    const sessionSets = await this.db.select().from(schema.sets).where(eq(schema.sets.sessionId, id))
    return { ...toWorkoutSession(s), sets: sessionSets.map(toWorkoutSet) }
  }

  async getActiveSession(userId: string) {
    return await this.sessions.findActive(userId)
  }

  async startSession(userId: string, dto: StartSessionDto) {
    const active = await this.getActiveSession(userId)
    if (active) {
      throw new BadRequestException('A session is already active')
    }
    const id = randomUUID()
    await this.db
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

    if (dto.templateId) {
      const [phaseTemplate] = await this.db
        .select({ phaseId: schema.programPhaseTemplates.phaseId })
        .from(schema.programPhaseTemplates)
        .where(eq(schema.programPhaseTemplates.templateId, dto.templateId))
        .limit(1)

      if (phaseTemplate) {
        await this.db
          .update(schema.workoutSessions)
          .set({ programPhaseId: phaseTemplate.phaseId })
          .where(eq(schema.workoutSessions.id, id))
      }
    }

    return this.getSession(id, userId)
  }

  async finishSession(id: string, userId: string, dto: FinishSessionDto) {
    await this.getSession(id, userId)
    await this.db
      .update(schema.workoutSessions)
      .set({ finishedAt: Math.floor(Date.now() / 1000), notes: dto.notes ?? null })
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))

    this.progressionService.generateForSession(id, userId).catch(err => {
      this.logger.error(`Progression generation failed for session ${id}`, err)
    })

    this.programService.evaluateAfterSession(id, userId).catch(err => {
      this.logger.error(`Program adaptation evaluation failed for session ${id}`, err)
    })

    return this.getSession(id, userId)
  }

  async deleteSession(id: string, userId: string) {
    await this.getSession(id, userId)
    await this.db.delete(schema.sets).where(eq(schema.sets.sessionId, id))
    await this.db
      .delete(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
  }
}
