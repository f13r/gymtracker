import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common'
import { eq, and, desc, gte } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'

import { estimateE1rm, GeneratedProgramSchema } from '@gymtracker/shared'

import { GeminiService } from '../ai/gemini.service'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { CoachingKnowledgeService } from '../progression/coaching-knowledge.service'

const HISTORY_WINDOW_DAYS = 90

type UserProgramContext = {
  experienceLevel: string
  goal: string
  trainingDays: string[]
  sessionDurationMinutes: number
  latestBodyWeightKg: number | null
  age?: number | null
  heightCm?: number | null
  gender?: string | null
}

type AvailableExercise = {
  id: string
  name: string
  category: string | null
}

type ParsedPhaseTemplate = {
  name: string
  dayLabel: string
  exercises: {
    exerciseId: string
    orderIndex: number
    defaultSets: number
    defaultReps: number
    defaultWeightKg: number
  }[]
}

type ParsedPhase = {
  name: string
  type: string
  durationWeeks: number
  splitType: string
  rationale: string
  templates: ParsedPhaseTemplate[]
  targetSessionCount: number
}

type ParsedProgram = {
  name: string
  phases: ParsedPhase[]
}

type PhaseWithTemplates = {
  id: string
  programId: string
  name: string
  type: string
  orderIndex: number
  targetSessionCount: number
  completedSessionCount: number
  splitType: string
  rationale: string
  status: string
  templates: (typeof schema.programPhaseTemplates.$inferSelect)[]
}

@Injectable()
export class ProgramService {
  private readonly logger = new Logger(ProgramService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private readonly gemini: GeminiService,
    private readonly coachingKnowledge: CoachingKnowledgeService,
  ) {}

  /**
   * Gathers everything the generation prompt needs (profile, exercise library,
   * coaching chunks, recent training history) and builds the prompt — without
   * calling the AI or mutating anything. Shared by generate + preview.
   */
  private async assembleGenerationInputs(userId: string) {
    const userCtx = await this.getUserProgramContext(userId)

    const exercises = await this.getAvailableExercises(userId)
    if (exercises.length === 0) {
      throw new BadRequestException(
        'No exercises found. Add some exercises to your library first so the AI knows what to prescribe.',
      )
    }

    const situationSummary = `${userCtx.experienceLevel} lifter, goal: ${userCtx.goal}, ${userCtx.trainingDays.length} days/week, ${userCtx.sessionDurationMinutes} min sessions, creating new program from scratch`
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary, userId)
    } catch {
      this.logger.warn('Coaching RAG failed during program generation — proceeding without chunks')
    }

    const historySummary = await this.buildTrainingHistorySummary(userId)

    const prompt = this.buildGenerationPrompt(userCtx, exercises, coachingChunks, historySummary)
    return { userCtx, exercises, prompt }
  }

  /** Build the exact prompt that generation would send, without calling the AI. */
  async previewGenerationPrompt(userId: string): Promise<{ prompt: string }> {
    const { prompt } = await this.assembleGenerationInputs(userId)
    return { prompt }
  }

  async generateProgram(userId: string) {
    const { userCtx, exercises, prompt } = await this.assembleGenerationInputs(userId)

    // Call + validate BEFORE mutating anything. The previous program is only
    // abandoned inside persistProgram's transaction, so a failed/invalid
    // generation leaves the user's existing active program untouched.
    const raw = await this.callGemini(prompt, userId)
    const validExerciseIds = new Set(exercises.map(e => e.id))
    const parsed = this.parseGeminiProgram(raw, userCtx.trainingDays.length, validExerciseIds)

    return this.persistProgram(userId, parsed, userCtx.trainingDays)
  }

  /**
   * Per-exercise summary of the user's done sets in the last 90 days: how many
   * sessions, best set + estimated 1RM, most recent set, and any notes. Lets the
   * AI prescribe familiar exercises with realistic starting loads. '' if no history.
   */
  async buildTrainingHistorySummary(userId: string): Promise<string> {
    const cutoff = Math.floor(Date.now() / 1000) - HISTORY_WINDOW_DAYS * 86400
    const rows = await this.db
      .select({
        name: schema.exercises.name,
        category: schema.exercises.category,
        weightKg: schema.sets.weightKg,
        reps: schema.sets.reps,
        completedAt: schema.sets.completedAt,
        notes: schema.sets.notes,
      })
      .from(schema.sets)
      .innerJoin(schema.workoutSessions, eq(schema.workoutSessions.id, schema.sets.sessionId))
      .innerJoin(schema.exercises, eq(schema.exercises.id, schema.sets.exerciseId))
      .where(
        and(eq(schema.workoutSessions.userId, userId), eq(schema.sets.done, 1), gte(schema.sets.completedAt, cutoff)),
      )

    if (rows.length === 0) return ''

    type Agg = {
      category: string | null
      sets: { weightKg: number | null; reps: number | null }[]
      days: Set<number>
      latest: { at: number; weightKg: number | null; reps: number | null }
      notes: Set<string>
    }
    const byExercise = new Map<string, Agg>()
    for (const r of rows) {
      const agg = byExercise.get(r.name) ?? {
        category: r.category,
        sets: [],
        days: new Set<number>(),
        latest: { at: -1, weightKg: null, reps: null },
        notes: new Set<string>(),
      }
      agg.sets.push({ weightKg: r.weightKg, reps: r.reps })
      if (r.completedAt != null) {
        agg.days.add(Math.floor(r.completedAt / 86400))
        if (r.completedAt > agg.latest.at) agg.latest = { at: r.completedAt, weightKg: r.weightKg, reps: r.reps }
      }
      if (r.notes) agg.notes.add(r.notes)
      byExercise.set(r.name, agg)
    }

    const lines = [...byExercise.entries()]
      .sort((a, b) => b[1].days.size - a[1].days.size)
      .map(([name, a]) => {
        const best = a.sets.filter(s => s.weightKg != null).sort((x, y) => (y.weightKg ?? 0) - (x.weightKg ?? 0))[0]
        const e1rm = estimateE1rm(
          a.sets.filter(s => s.weightKg != null && s.reps != null) as { weightKg: number; reps: number }[],
        )
        const latest = a.latest
        const fmt = (w: number | null, reps: number | null) =>
          w != null ? `${w}kg×${reps ?? '?'}` : `${reps ?? '?'} reps (bodyweight)`
        const parts = [
          `- ${name} (${a.category ?? 'other'}): ${a.days.size} session${a.days.size === 1 ? '' : 's'}`,
          best ? `best ${fmt(best.weightKg, best.reps)}` : null,
          e1rm ? `~${e1rm}kg e1RM` : null,
          `latest ${fmt(latest.weightKg, latest.reps)}`,
          a.notes.size
            ? `notes: ${[...a.notes]
                .slice(0, 4)
                .map(n => `"${n}"`)
                .join(', ')}`
            : null,
        ].filter(Boolean)
        return parts.join(', ')
      })

    return lines.join('\n')
  }

  buildGenerationPrompt(
    user: UserProgramContext,
    exercises: AvailableExercise[],
    coachingChunks: string[],
    historySummary = '',
  ): string {
    const exerciseList = exercises.map(e => `- ${e.name} [id: ${e.id}] (${e.category ?? 'other'})`).join('\n')
    const coachingSection =
      coachingChunks.length > 0
        ? `COACHING PRINCIPLES (apply these when designing the program):\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
        : ''
    const historySection = historySummary
      ? `\nYOUR RECENT TRAINING (last ${HISTORY_WINDOW_DAYS} days — prefer these familiar exercises and base starting weights on these actual loads, not generic percentages):\n${historySummary}\n`
      : ''
    // When the user has training history, weights come from those real loads;
    // the conservative %-of-1RM estimate is only the fallback for exercises with
    // no history (and the only rule when there's no history section at all).
    const startingWeightsRule = historySummary
      ? '- Starting weights: for any exercise listed under YOUR RECENT TRAINING, base the starting load on those actual numbers (a slightly conservative working weight, not the all-time best). ONLY for exercises with no listed history, estimate conservatively — roughly 30-40% of an estimated 1RM derived from body weight and experience.'
      : '- Starting weights: conservative — roughly 30-40% of an estimated 1RM derived from body weight and experience.'

    return [
      'You are a certified strength and conditioning coach creating a personalised multi-phase training program.',
      '',
      coachingSection,
      'USER PROFILE:',
      `Experience level: ${user.experienceLevel}`,
      `Goal: ${user.goal}`,
      user.gender ? `Gender: ${user.gender}` : null,
      user.age ? `Age: ${user.age}` : null,
      user.heightCm ? `Height: ${user.heightCm}cm` : null,
      `Available training days: ${user.trainingDays.join(', ')}`,
      `Session duration: ${user.sessionDurationMinutes} minutes`,
      user.latestBodyWeightKg ? `Body weight: ${user.latestBodyWeightKg}kg` : 'Body weight: unknown',
      historySection,
      'AVAILABLE EXERCISES (only prescribe exercises from this list, use exact IDs):',
      exerciseList,
      '',
      'TASK:',
      'Design a complete multi-phase training program. For a beginner: start with full-body 3x/week for 8 weeks (accumulation), then progress to an appropriate split for another 8 weeks. For intermediate/advanced: adjust phases accordingly.',
      '',
      'Return ONLY valid JSON in exactly this structure (no markdown, no explanation):',
      JSON.stringify(
        {
          name: 'Program name (inspiring, concise)',
          phases: [
            {
              name: 'Phase user-facing name',
              type: 'accumulation | strength | peaking | maintenance',
              durationWeeks: 8,
              splitType: 'full_body | upper_lower | push_pull_legs',
              rationale: 'Why this phase structure for this user (2-3 sentences shown to user)',
              templates: [
                {
                  name: 'Template name e.g. Full Body A',
                  dayLabel: 'A',
                  exercises: [
                    {
                      exerciseId: 'exact-exercise-id-from-list',
                      orderIndex: 0,
                      defaultSets: 3,
                      defaultReps: 8,
                      defaultWeightKg: 40,
                    },
                  ],
                },
              ],
            },
          ],
        },
        null,
        2,
      ),
      '',
      'Rules:',
      '- targetSessionCount is computed as durationWeeks × trainingDaysPerWeek (do not include in output — computed by the server).',
      '- exerciseId must exactly match one of the IDs from the AVAILABLE EXERCISES list.',
      `- For beginners: 2 templates per full-body phase (A and B), alternating. Size each template to fit the user's ${user.sessionDurationMinutes}-minute sessions (about one exercise per 15-20 minutes of training).`,
      '- For upper/lower split: 2 templates (Upper, Lower). For PPL: 3 templates (Push, Pull, Legs).',
      startingWeightsRule,
    ].join('\n')
  }

  parseGeminiProgram(raw: unknown, daysPerWeek: number, validExerciseIds: Set<string>): ParsedProgram {
    const result = GeneratedProgramSchema.safeParse(raw)
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
      throw new Error(`Invalid AI program response: ${issues}`)
    }
    const data = result.data

    // Every prescribed exerciseId must exist in the user's available library.
    // Caught here (not at INSERT time) so we never start writing a program that
    // would hit a foreign-key error partway through.
    const unknownIds = new Set<string>()
    for (const phase of data.phases) {
      for (const tmpl of phase.templates) {
        for (const ex of tmpl.exercises) {
          if (!validExerciseIds.has(ex.exerciseId)) unknownIds.add(ex.exerciseId)
        }
      }
    }
    if (unknownIds.size > 0) {
      throw new Error(`AI prescribed unknown exercise IDs not in your library: ${[...unknownIds].join(', ')}`)
    }

    const phases: ParsedPhase[] = data.phases.map(phase => ({
      name: phase.name,
      type: phase.type,
      durationWeeks: phase.durationWeeks,
      splitType: phase.splitType,
      rationale: phase.rationale,
      templates: phase.templates,
      targetSessionCount: phase.durationWeeks * daysPerWeek,
    }))

    return { name: data.name, phases }
  }

  buildAdaptationPrompt(
    phase: PhaseWithTemplates,
    signals: {
      volumePlateau: boolean
      averageRpe: number
      consecutiveWeeksSinceProgress: number
      isLastPhase: boolean
    },
    coachingChunks: string[],
  ): string {
    const coachingSection =
      coachingChunks.length > 0
        ? `COACHING PRINCIPLES:\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
        : ''

    return [
      "You are a certified strength coach evaluating whether a user's training program phase needs adjustment.",
      '',
      coachingSection,
      'CURRENT PHASE:',
      `Name: ${phase.name}`,
      `Type: ${phase.type}`,
      `Split: ${phase.splitType}`,
      `Progress: ${phase.completedSessionCount} of ${phase.targetSessionCount} sessions completed`,
      `Volume plateau detected: ${signals.volumePlateau}`,
      `Average RPE last 2 weeks: ${signals.averageRpe}`,
      `Consecutive weeks without load progress: ${signals.consecutiveWeeksSinceProgress}`,
      `This is the last phase: ${signals.isLastPhase}`,
      '',
      'Decide ONE of the following actions (or "none" if no change needed):',
      '- "phase_transition": move to the next phase',
      '- "exercise_swap": replace a stalled exercise with a variation',
      '- "deload": reduce volume 40-50% for one week then continue',
      '- "phase_extension": add sessions to the current phase',
      '- "none": no change needed',
      '',
      'Return ONLY valid JSON:',
      JSON.stringify(
        {
          action: 'phase_transition | exercise_swap | deload | phase_extension | none',
          description: '1-sentence user-facing summary of what is changing',
          reason: 'Coaching rationale (2-3 sentences)',
          evidence: ['specific signal 1', 'specific signal 2'],
          proposedChanges: { note: 'action-specific payload' },
        },
        null,
        2,
      ),
    ].join('\n')
  }

  private async callGemini(prompt: string, userId: string): Promise<unknown> {
    // No responseSchema — program JSON shape is enforced by the prompt itself.
    // Logged automatically by GeminiService under the 'program' feature tag.
    return this.gemini.generateStructured<unknown>({ feature: 'program', prompt, userId })
  }

  private async getUserProgramContext(userId: string): Promise<UserProgramContext> {
    const [profile] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)

    if (!profile?.experienceLevel || !profile?.goal || !profile?.trainingDays) {
      throw new BadRequestException(
        'Complete your profile (experience level, goal, training days) before generating a Program.',
      )
    }

    const [latestWeight] = await this.db
      .select({ weightKg: schema.bodyWeights.weightKg })
      .from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt))
      .limit(1)

    return {
      experienceLevel: profile.experienceLevel,
      goal: profile.goal,
      trainingDays: JSON.parse(profile.trainingDays) as string[],
      sessionDurationMinutes: profile.sessionDurationMinutes ?? 60,
      latestBodyWeightKg: latestWeight?.weightKg ?? null,
      age: profile.age ?? null,
      heightCm: profile.heightCm ?? null,
      gender: profile.gender ?? null,
    }
  }

  private async getAvailableExercises(userId: string): Promise<AvailableExercise[]> {
    const [gym] = await this.db
      .select({ id: schema.gyms.id })
      .from(schema.gyms)
      .where(eq(schema.gyms.userId, userId))
      .limit(1)

    if (gym) {
      const equipmentExercises = await this.db
        .selectDistinct({ id: schema.exercises.id, name: schema.exercises.name, category: schema.exercises.category })
        .from(schema.exercises)
        .innerJoin(schema.equipmentExercises, eq(schema.equipmentExercises.exerciseId, schema.exercises.id))
        .innerJoin(schema.equipment, eq(schema.equipment.id, schema.equipmentExercises.equipmentId))
        .where(eq(schema.equipment.gymId, gym.id))

      if (equipmentExercises.length > 0) return equipmentExercises
    }

    // No gym/equipment configured: offer the user's whole library (their imported
    // and custom exercises plus the seeded defaults), not just the defaults.
    return this.db
      .select({ id: schema.exercises.id, name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.userId, userId))
  }

  private async persistProgram(userId: string, parsed: ParsedProgram, trainingDays: string[]) {
    const now = Math.floor(Date.now() / 1000)
    const programId = randomUUID()
    const DAY_MAP: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    }

    // Everything below — abandoning the old program, clearing its schedule, and
    // writing the new program/phases/templates/exercises/schedules — runs in one
    // transaction. If any insert fails, the whole thing rolls back and the user
    // keeps their previous active program intact (no half-written state).
    await this.db.transaction(async tx => {
      await tx
        .update(schema.programs)
        .set({ status: 'abandoned' })
        .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, 'active')))

      await tx
        .delete(schema.workoutSchedules)
        .where(and(eq(schema.workoutSchedules.userId, userId), eq(schema.workoutSchedules.type, 'weekly')))

      await tx.insert(schema.programs).values({
        id: programId,
        userId,
        name: parsed.name,
        goal: '',
        experienceLevel: '',
        status: 'active',
        createdAt: now,
      })

      for (const [i, phase] of parsed.phases.entries()) {
        const phaseId = randomUUID()

        await tx.insert(schema.programPhases).values({
          id: phaseId,
          programId,
          name: phase.name,
          type: phase.type,
          orderIndex: i,
          targetSessionCount: phase.targetSessionCount,
          completedSessionCount: 0,
          splitType: phase.splitType,
          rationale: phase.rationale,
          status: i === 0 ? 'active' : 'pending',
        })

        for (const [templateIndex, tmpl] of phase.templates.entries()) {
          const templateId = randomUUID()
          await tx.insert(schema.workoutTemplates).values({
            id: templateId,
            userId,
            name: tmpl.name,
            notes: null,
            createdAt: now,
          })

          for (const ex of tmpl.exercises) {
            await tx.insert(schema.templateExercises).values({
              id: randomUUID(),
              templateId,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              defaultSets: ex.defaultSets,
              defaultReps: ex.defaultReps,
              defaultWeightKg: ex.defaultWeightKg,
              equipmentId: null,
            })
          }

          await tx.insert(schema.programPhaseTemplates).values({
            id: randomUUID(),
            phaseId,
            templateId,
            dayLabel: tmpl.dayLabel,
          })

          if (i === 0) {
            const assignedDays = trainingDays.filter((_, idx) => idx % phase.templates.length === templateIndex)
            for (const day of assignedDays) {
              await tx.insert(schema.workoutSchedules).values({
                id: randomUUID(),
                userId,
                templateId,
                type: 'weekly',
                scheduledDate: null,
                dayOfWeek: DAY_MAP[day] ?? 1,
                createdAt: now,
              })
            }
          }
        }
      }
    })

    return this.getActiveProgram(userId)
  }

  async abandonActiveProgram(userId: string) {
    await this.db
      .update(schema.programs)
      .set({ status: 'abandoned' })
      .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, 'active')))

    // Clear the weekly schedule so the user truly starts fresh; a new program
    // re-creates these in persistProgram. Session history is preserved because
    // sessions reference programPhaseId, not the schedule.
    await this.db
      .delete(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.userId, userId), eq(schema.workoutSchedules.type, 'weekly')))
  }

  async getActiveProgram(userId: string) {
    const [program] = await this.db
      .select()
      .from(schema.programs)
      .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, 'active')))
      .limit(1)

    if (!program) return null

    const phases = await this.db
      .select()
      .from(schema.programPhases)
      .where(eq(schema.programPhases.programId, program.id))
      .orderBy(schema.programPhases.orderIndex)

    const phasesWithTemplates = await Promise.all(
      phases.map(async phase => ({
        ...phase,
        templates: await this.db
          .select()
          .from(schema.programPhaseTemplates)
          .where(eq(schema.programPhaseTemplates.phaseId, phase.id)),
      })),
    )

    const [pendingUpdate] = await this.db
      .select()
      .from(schema.programUpdates)
      .where(and(eq(schema.programUpdates.programId, program.id), eq(schema.programUpdates.status, 'pending')))
      .orderBy(desc(schema.programUpdates.createdAt))
      .limit(1)

    return {
      ...program,
      phases: phasesWithTemplates,
      pendingUpdate: pendingUpdate
        ? { ...pendingUpdate, evidence: JSON.parse(pendingUpdate.evidence) as string[] }
        : null,
    }
  }

  async evaluateAfterSession(sessionId: string, userId: string) {
    try {
      await this.runAdaptationEvaluation(userId, sessionId)
    } catch (err) {
      this.logger.warn(`Program adaptation evaluation failed for session ${sessionId}`, err)
    }
  }

  async evaluateNow(userId: string) {
    return this.runAdaptationEvaluation(userId, null)
  }

  private async runAdaptationEvaluation(userId: string, sessionId: string | null) {
    const program = await this.getActiveProgram(userId)
    if (!program) return

    if (program.pendingUpdate) return

    const activePhase = program.phases.find(p => p.status === 'active')
    if (!activePhase) return

    if (sessionId) {
      const [session] = await this.db
        .select()
        .from(schema.workoutSessions)
        .where(and(eq(schema.workoutSessions.id, sessionId), eq(schema.workoutSessions.programPhaseId, activePhase.id)))
        .limit(1)

      if (session) {
        await this.db
          .update(schema.programPhases)
          .set({ completedSessionCount: activePhase.completedSessionCount + 1 })
          .where(eq(schema.programPhases.id, activePhase.id))
        activePhase.completedSessionCount += 1
      }
    }

    const signals = await this.computePerformanceSignals(userId, activePhase)
    const isLastPhase = activePhase.orderIndex === program.phases.length - 1
    const phaseComplete = activePhase.completedSessionCount >= activePhase.targetSessionCount

    const needsUpdate =
      phaseComplete || signals.volumePlateau || (signals.averageRpe >= 9 && signals.consecutiveWeeksSinceProgress >= 2)

    if (!needsUpdate) return

    const situationSummary = `${activePhase.type} phase, ${activePhase.completedSessionCount}/${activePhase.targetSessionCount} sessions done, RPE avg ${signals.averageRpe}, plateau: ${signals.volumePlateau}`
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary, userId)
    } catch {
      /* proceed without */
    }

    const prompt = this.buildAdaptationPrompt(activePhase, { ...signals, isLastPhase }, coachingChunks)
    const raw = await this.callGemini(prompt, userId)
    await this.persistProgramUpdate(program.id, raw)
  }

  private async computePerformanceSignals(userId: string, phase: { id: string }) {
    const recentSets = await this.db
      .select({ rpe: schema.sets.rpe })
      .from(schema.sets)
      .innerJoin(schema.workoutSessions, eq(schema.workoutSessions.id, schema.sets.sessionId))
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          eq(schema.workoutSessions.programPhaseId, phase.id),
          eq(schema.sets.done, 1),
        ),
      )

    const rpeSets = recentSets.filter(s => s.rpe !== null)
    const averageRpe = rpeSets.length > 0 ? rpeSets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / rpeSets.length : 0

    return {
      volumePlateau: false, // TODO: implement full plateau detection
      averageRpe: Math.round(averageRpe * 10) / 10,
      consecutiveWeeksSinceProgress: 0, // TODO: implement
    }
  }

  private async persistProgramUpdate(programId: string, raw: unknown) {
    const obj = raw as Record<string, unknown>
    if (!obj || obj.action === 'none') return

    await this.db.insert(schema.programUpdates).values({
      id: randomUUID(),
      programId,
      type: obj.action as string,
      description: (obj.description as string) ?? '',
      reason: (obj.reason as string) ?? '',
      evidence: JSON.stringify(obj.evidence ?? []),
      proposedChanges: JSON.stringify(obj.proposedChanges ?? {}),
      status: 'pending',
      createdAt: Math.floor(Date.now() / 1000),
    })
  }

  async acknowledgeProgramUpdate(updateId: string, userId: string, action: 'accept' | 'dismiss') {
    const [update] = await this.db
      .select()
      .from(schema.programUpdates)
      .innerJoin(schema.programs, eq(schema.programs.id, schema.programUpdates.programId))
      .where(
        and(
          eq(schema.programUpdates.id, updateId),
          eq(schema.programs.userId, userId),
          eq(schema.programUpdates.status, 'pending'),
        ),
      )
      .limit(1)

    if (!update) throw new BadRequestException('Update not found or already acknowledged')

    await this.db
      .update(schema.programUpdates)
      .set({ status: action === 'accept' ? 'accepted' : 'dismissed' })
      .where(eq(schema.programUpdates.id, updateId))

    if (action === 'accept') {
      await this.applyProgramUpdate(update.program_updates, update.programs)
    }
  }

  private async applyProgramUpdate(
    update: typeof schema.programUpdates.$inferSelect,
    program: typeof schema.programs.$inferSelect,
  ) {
    const changes = JSON.parse(update.proposedChanges) as Record<string, unknown>

    if (update.type === 'phase_transition') {
      const phases = await this.db
        .select()
        .from(schema.programPhases)
        .where(eq(schema.programPhases.programId, program.id))
        .orderBy(schema.programPhases.orderIndex)

      const activePhase = phases.find(p => p.status === 'active')
      const nextPhase = activePhase ? phases.find(p => p.orderIndex === activePhase.orderIndex + 1) : null

      if (activePhase) {
        await this.db
          .update(schema.programPhases)
          .set({ status: 'completed' })
          .where(eq(schema.programPhases.id, activePhase.id))
      }

      if (nextPhase) {
        await this.db
          .update(schema.programPhases)
          .set({ status: 'active' })
          .where(eq(schema.programPhases.id, nextPhase.id))

        const nextTemplates = await this.db
          .select()
          .from(schema.programPhaseTemplates)
          .where(eq(schema.programPhaseTemplates.phaseId, nextPhase.id))

        await this.db
          .delete(schema.workoutSchedules)
          .where(and(eq(schema.workoutSchedules.userId, program.userId), eq(schema.workoutSchedules.type, 'weekly')))

        const [profile] = await this.db
          .select()
          .from(schema.userProfiles)
          .where(eq(schema.userProfiles.userId, program.userId))
          .limit(1)

        if (profile?.trainingDays) {
          const days = JSON.parse(profile.trainingDays) as string[]
          const DAY_MAP: Record<string, number> = {
            sunday: 0,
            monday: 1,
            tuesday: 2,
            wednesday: 3,
            thursday: 4,
            friday: 5,
            saturday: 6,
          }
          const now = Math.floor(Date.now() / 1000)
          for (const [i, day] of days.entries()) {
            const template = nextTemplates[i % nextTemplates.length]
            if (template) {
              await this.db.insert(schema.workoutSchedules).values({
                id: randomUUID(),
                userId: program.userId,
                templateId: template.templateId,
                type: 'weekly',
                scheduledDate: null,
                dayOfWeek: DAY_MAP[day] ?? 1,
                createdAt: now,
              })
            }
          }
        }
      } else {
        await this.db.update(schema.programs).set({ status: 'completed' }).where(eq(schema.programs.id, program.id))
      }
    }

    if (update.type === 'phase_extension') {
      const additionalSessions = Number(changes.additionalSessions ?? 6)
      const [activePhase] = await this.db
        .select()
        .from(schema.programPhases)
        .where(and(eq(schema.programPhases.programId, program.id), eq(schema.programPhases.status, 'active')))
        .limit(1)
      if (activePhase) {
        await this.db
          .update(schema.programPhases)
          .set({ targetSessionCount: activePhase.targetSessionCount + additionalSessions })
          .where(eq(schema.programPhases.id, activePhase.id))
      }
    }

    // exercise_swap and deload: TODO — requires template exercise mutation
  }
}
