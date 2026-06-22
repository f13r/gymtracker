import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { eq, and, asc, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import {
  CreateTemplateDto,
  ExerciseComparison,
  FinishSessionDto,
  StartSessionDto,
  UpdateTemplateDto,
} from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import { toWorkoutSession, toWorkoutSet, toSessionExercise } from '../drizzle/mappers'
import * as schema from '../drizzle/schema'
import { lastDoneAggregateSql, lastFinishedSessionSetsSql } from '../drizzle/set-queries'
import { ProgramService } from '../program/program.service'
import { ProgressionService } from '../progression/progression.service'
import { SessionRepository } from '../sessions/session.repository'
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
      await this.db.insert(schema.templateExercises).values({
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

  // Mutates the Template in place — same id, full-replace of its exercises — so every Schedule and
  // Session that references it by templateId stays intact. See docs/adr/0007.
  async updateTemplate(id: string, userId: string, dto: UpdateTemplateDto) {
    await this.getTemplate(id, userId)
    await this.db
      .update(schema.workoutTemplates)
      .set({ name: dto.name, notes: dto.notes ?? null })
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
    await this.db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id))
    for (const ex of dto.exercises) {
      await this.db.insert(schema.templateExercises).values({
        id: randomUUID(),
        templateId: id,
        exerciseId: ex.exerciseId,
        orderIndex: ex.orderIndex,
        defaultSets: ex.defaultSets ?? null,
        defaultReps: ex.defaultReps ?? null,
        defaultWeightKg: ex.defaultWeightKg ?? null,
        equipmentId: ex.equipmentId ?? null,
      })
    }
    return this.getTemplate(id, userId)
  }

  // Append a single Exercise to a Template at the end of its list — the "Add to <Template>
  // permanently" path from the in-session picker. No-op if it's already in the Template.
  async addTemplateExercise(templateId: string, userId: string, exerciseId: string) {
    const tpl = await this.getTemplate(templateId, userId)
    if (tpl.exercises.some(e => e.exerciseId === exerciseId)) {
      return tpl
    }
    const nextOrder = tpl.exercises.reduce((max, e) => Math.max(max, e.orderIndex + 1), 0)
    await this.db.insert(schema.templateExercises).values({
      id: randomUUID(),
      templateId,
      exerciseId,
      orderIndex: nextOrder,
      defaultSets: null,
      defaultReps: null,
      defaultWeightKg: null,
      equipmentId: null,
    })
    return this.getTemplate(templateId, userId)
  }

  async deleteTemplate(id: string, userId: string) {
    await this.getTemplate(id, userId)
    await this.db.delete(schema.programPhaseTemplates).where(eq(schema.programPhaseTemplates.templateId, id))
    await this.db.delete(schema.workoutSchedules).where(eq(schema.workoutSchedules.templateId, id))
    await this.db
      .update(schema.workoutSessions)
      .set({ templateId: null })
      .where(eq(schema.workoutSessions.templateId, id))
    await this.db.delete(schema.templateExercises).where(eq(schema.templateExercises.templateId, id))
    await this.db
      .delete(schema.workoutTemplates)
      .where(and(eq(schema.workoutTemplates.id, id), eq(schema.workoutTemplates.userId, userId)))
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
    const sessionSets = await this.db
      .select()
      .from(schema.sets)
      .where(eq(schema.sets.sessionId, id))
      .orderBy(asc(schema.sets.setNumber), asc(schema.sets.id))
    const exercises = await this.db
      .select()
      .from(schema.sessionExercises)
      .where(eq(schema.sessionExercises.sessionId, id))
      .orderBy(asc(schema.sessionExercises.orderIndex))
    return {
      ...toWorkoutSession(s),
      sets: sessionSets.map(toWorkoutSet),
      exercises: exercises.map(toSessionExercise),
    }
  }

  /**
   * Last-Done Comparison for a finished Session: for each Exercise in the
   * Session, the Done-Set aggregate of its most recent earlier occurrence (see
   * lastDoneAggregateSql). Exercises with no earlier occurrence are omitted —
   * the client renders those as "first time". Anchored to *this* Session's
   * startedAt so viewing an old Session compares against what was actually
   * previous at that time, never a later Session.
   */
  async getSessionComparison(id: string, userId: string): Promise<ExerciseComparison[]> {
    const [s] = await this.db
      .select({ startedAt: schema.workoutSessions.startedAt })
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
      .limit(1)
    if (!s) {
      throw new NotFoundException('Session not found')
    }

    // Every Exercise shown on the detail page: the snapshot's session_exercises
    // plus any Exercise that has Sets but no session_exercises row (freeform
    // Sessions and mid-Session adds), matching the page's render set.
    const exerciseRows = await this.db
      .select({ exerciseId: schema.sessionExercises.exerciseId })
      .from(schema.sessionExercises)
      .where(eq(schema.sessionExercises.sessionId, id))
    const setExerciseRows = await this.db
      .selectDistinct({ exerciseId: schema.sets.exerciseId })
      .from(schema.sets)
      .where(eq(schema.sets.sessionId, id))
    const exerciseIds = [
      ...new Set([...exerciseRows, ...setExerciseRows].map(r => r.exerciseId).filter((id): id is string => id != null)),
    ]

    const comparisons = await Promise.all(
      exerciseIds.map(async exerciseId => {
        const res = await this.db.execute(lastDoneAggregateSql(exerciseId, userId, s.startedAt))
        const row = res.rows[0] as
          | { comparedToStartedAt: number; topSetKg: number | null; doneSets: number; volume: number | null }
          | undefined
        if (!row) {
          return null
        }
        return {
          exerciseId,
          comparedToStartedAt: Number(row.comparedToStartedAt),
          topSetKg: row.topSetKg == null ? null : Number(row.topSetKg),
          doneSets: Number(row.doneSets),
          volume: row.volume == null ? null : Number(row.volume),
        } satisfies ExerciseComparison
      }),
    )
    return comparisons.filter((c): c is ExerciseComparison => c !== null)
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
    // The session row, its program-phase link, and the whole plan snapshot are
    // written atomically: a mid-snapshot failure must leave no session and no
    // partial set of session_exercises/sets rows behind. Per ADR-0008.
    await this.db.transaction(async tx => {
      await tx.insert(schema.workoutSessions).values({
        id,
        userId,
        templateId: dto.templateId ?? null,
        name: dto.name,
        startedAt: Math.floor(Date.now() / 1000),
        finishedAt: null,
        notes: null,
      })

      if (dto.templateId) {
        const [phaseTemplate] = await tx
          .select({ phaseId: schema.programPhaseTemplates.phaseId })
          .from(schema.programPhaseTemplates)
          .where(eq(schema.programPhaseTemplates.templateId, dto.templateId))
          .limit(1)

        if (phaseTemplate) {
          await tx
            .update(schema.workoutSessions)
            .set({ programPhaseId: phaseTemplate.phaseId })
            .where(eq(schema.workoutSessions.id, id))
        }

        await this.snapshotPlan(tx, id, userId, dto.templateId)
      }
    })

    return this.getSession(id, userId)
  }

  /**
   * Take the Session Snapshot: copy the Template's ordered exercise list (and set
   * count) into session-owned rows, seeding each Set's reps/weight from the
   * Exercise's last-done values (Template default the first time). Per ADR-0008.
   */
  private async snapshotPlan(
    tx: NodePgDatabase<typeof schema>,
    sessionId: string,
    userId: string,
    templateId: string,
  ) {
    // Idempotent: a Session is snapshotted exactly once. If rows already exist
    // (a retried or future "restart" Start), do nothing rather than inserting a
    // duplicate set of session_exercises/sets. Per ADR-0008 ("re-read at Start"
    // applies to *new* Sessions, not re-snapshotting an existing one).
    const [existing] = await tx
      .select({ id: schema.sessionExercises.id })
      .from(schema.sessionExercises)
      .where(eq(schema.sessionExercises.sessionId, sessionId))
      .limit(1)
    if (existing) {
      return
    }

    const templateExercises = await tx
      .select()
      .from(schema.templateExercises)
      .where(eq(schema.templateExercises.templateId, templateId))
      .orderBy(asc(schema.templateExercises.orderIndex))

    for (const te of templateExercises) {
      if (!te.exerciseId) {
        continue
      }

      await tx.insert(schema.sessionExercises).values({
        id: randomUUID(),
        sessionId,
        exerciseId: te.exerciseId,
        orderIndex: te.orderIndex,
        equipmentId: te.equipmentId ?? null,
      })

      const setCount = te.defaultSets ?? 3
      // Last-done Done Sets for this Exercise, by set position, for number seeding.
      const res = await tx.execute(lastFinishedSessionSetsSql(te.exerciseId, userId))
      const lastDone = (res.rows as Array<{ reps: number | null; weightKg: number | null; done: number }>).filter(
        r => r.done === 1,
      )

      for (let i = 0; i < setCount; i++) {
        // Match by position; carry the last known set forward for positions
        // last-done didn't reach; fall back to the Template default.
        const seed = lastDone[i] ?? lastDone[lastDone.length - 1]
        const reps = seed?.reps ?? te.defaultReps ?? null
        const weightKg = seed?.weightKg ?? te.defaultWeightKg ?? null
        await tx.insert(schema.sets).values({
          id: randomUUID(),
          sessionId,
          exerciseId: te.exerciseId,
          setNumber: i + 1,
          reps,
          weightKg,
          done: 0,
          removedAt: null,
          equipmentId: te.equipmentId ?? null,
        })
      }
    }
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
    await this.db.delete(schema.sessionExercises).where(eq(schema.sessionExercises.sessionId, id))
    await this.db
      .delete(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, userId)))
  }
}
