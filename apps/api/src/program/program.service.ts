import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, desc } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'crypto'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { CoachingKnowledgeService } from '../progression/coaching-knowledge.service'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type UserProgramContext = {
  experienceLevel: string
  goal: string
  trainingDays: string[]
  sessionDurationMinutes: number
  latestBodyWeightKg: number | null
}

type AvailableExercise = {
  id: string
  name: string
  category: string | null
}

type ParsedPhaseTemplate = {
  name: string
  dayLabel: string
  exercises: { exerciseId: string; orderIndex: number; defaultSets: number; defaultReps: number; defaultWeightKg: number }[]
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
  private readonly geminiApiKey: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    config: ConfigService,
    private readonly coachingKnowledge: CoachingKnowledgeService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  async generateProgram(userId: string) {
    const userCtx = await this.getUserProgramContext(userId)

    const exercises = await this.getAvailableExercises(userId)
    if (exercises.length === 0) {
      throw new BadRequestException(
        'No exercises found. Add equipment to your gym first so the AI knows what to prescribe.',
      )
    }

    await this.db
      .update(schema.programs)
      .set({ status: 'abandoned' })
      .where(and(eq(schema.programs.userId, userId), eq(schema.programs.status, 'active')))

    const situationSummary = `${userCtx.experienceLevel} lifter, goal: ${userCtx.goal}, ${userCtx.trainingDays.length} days/week, ${userCtx.sessionDurationMinutes} min sessions, creating new program from scratch`
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
    } catch {
      this.logger.warn('Coaching RAG failed during program generation — proceeding without chunks')
    }

    const prompt = this.buildGenerationPrompt(userCtx, exercises, coachingChunks)
    const raw = await this.callGemini(prompt)
    const parsed = this.parseGeminiProgram(raw, userCtx.trainingDays.length)

    return this.persistProgram(userId, parsed, userCtx.trainingDays)
  }

  buildGenerationPrompt(user: UserProgramContext, exercises: AvailableExercise[], coachingChunks: string[]): string {
    const exerciseList = exercises.map(e => `- ${e.name} [id: ${e.id}] (${e.category ?? 'other'})`).join('\n')
    const coachingSection = coachingChunks.length > 0
      ? `COACHING PRINCIPLES (apply these when designing the program):\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
      : ''

    return [
      'You are a certified strength and conditioning coach creating a personalised multi-phase training program.',
      '',
      coachingSection,
      'USER PROFILE:',
      `Experience level: ${user.experienceLevel}`,
      `Goal: ${user.goal}`,
      `Available training days: ${user.trainingDays.join(', ')}`,
      `Session duration: ${user.sessionDurationMinutes} minutes`,
      user.latestBodyWeightKg ? `Body weight: ${user.latestBodyWeightKg}kg` : 'Body weight: unknown',
      '',
      'AVAILABLE EXERCISES (only prescribe exercises from this list, use exact IDs):',
      exerciseList,
      '',
      'TASK:',
      'Design a complete multi-phase training program. For a beginner: start with full-body 3x/week for 8 weeks (accumulation), then progress to an appropriate split for another 8 weeks. For intermediate/advanced: adjust phases accordingly.',
      '',
      'Return ONLY valid JSON in exactly this structure (no markdown, no explanation):',
      JSON.stringify({
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
      }, null, 2),
      '',
      'Rules:',
      '- targetSessionCount is computed as durationWeeks × trainingDaysPerWeek (do not include in output — computed by the server).',
      '- exerciseId must exactly match one of the IDs from the AVAILABLE EXERCISES list.',
      '- For beginners: 2 templates per full-body phase (A and B), alternating. 3-4 exercises per template max for 60-min sessions.',
      '- For upper/lower split: 2 templates (Upper, Lower). For PPL: 3 templates (Push, Pull, Legs).',
      '- Starting weights: conservative — roughly 30-40% of estimated 1RM based on body weight and experience.',
    ].join('\n')
  }

  parseGeminiProgram(raw: unknown, daysPerWeek: number): ParsedProgram {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid AI response: not an object')
    const obj = raw as Record<string, unknown>
    if (!obj.name || typeof obj.name !== 'string') throw new Error('Invalid AI response: missing name')
    if (!Array.isArray(obj.phases) || obj.phases.length === 0) throw new Error('Invalid AI response: missing phases')

    const phases: ParsedPhase[] = obj.phases.map((p: unknown, i: number) => {
      const phase = p as Record<string, unknown>
      if (!phase.name || !phase.type || !phase.durationWeeks || !phase.splitType || !phase.templates) {
        throw new Error(`Invalid phase at index ${i}`)
      }
      return {
        name: phase.name as string,
        type: phase.type as string,
        durationWeeks: Number(phase.durationWeeks),
        splitType: phase.splitType as string,
        rationale: (phase.rationale as string) ?? '',
        templates: phase.templates as ParsedPhaseTemplate[],
        targetSessionCount: Number(phase.durationWeeks) * daysPerWeek,
      }
    })

    return { name: obj.name as string, phases }
  }

  buildAdaptationPrompt(
    phase: PhaseWithTemplates,
    signals: { volumePlateau: boolean; averageRpe: number; consecutiveWeeksSinceProgress: number; isLastPhase: boolean },
    coachingChunks: string[],
  ): string {
    const coachingSection = coachingChunks.length > 0
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
      JSON.stringify({
        action: 'phase_transition | exercise_swap | deload | phase_extension | none',
        description: '1-sentence user-facing summary of what is changing',
        reason: 'Coaching rationale (2-3 sentences)',
        evidence: ['specific signal 1', 'specific signal 2'],
        proposedChanges: { note: 'action-specific payload' },
      }, null, 2),
    ].join('\n')
  }

  private async callGemini(prompt: string): Promise<unknown> {
    const response = await fetch(`${GEMINI_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`Gemini program generation failed ${response.status}: ${body}`)
    }
    const json = await response.json() as { candidates: { content: { parts: { text: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned empty response')
    return JSON.parse(text)
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

    return this.db
      .select({ id: schema.exercises.id, name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.isDefault, 1))
  }

  private async persistProgram(userId: string, parsed: ParsedProgram, trainingDays: string[]) {
    const now = Math.floor(Date.now() / 1000)
    const programId = randomUUID()

    await this.db.insert(schema.programs).values({
      id: programId,
      userId,
      name: parsed.name,
      goal: '',
      experienceLevel: '',
      status: 'active',
      createdAt: now,
    })

    await this.db
      .delete(schema.workoutSchedules)
      .where(and(eq(schema.workoutSchedules.userId, userId), eq(schema.workoutSchedules.type, 'weekly')))

    for (const [i, phase] of parsed.phases.entries()) {
      const phaseId = randomUUID()

      await this.db.insert(schema.programPhases).values({
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

      for (const tmpl of phase.templates) {
        const templateId = randomUUID()
        await this.db.insert(schema.workoutTemplates).values({
          id: templateId,
          userId,
          name: tmpl.name,
          notes: null,
          createdAt: now,
        })

        for (const ex of tmpl.exercises) {
          await this.db.insert(schema.templateExercises).values({
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

        await this.db.insert(schema.programPhaseTemplates).values({
          id: randomUUID(),
          phaseId,
          templateId,
          dayLabel: tmpl.dayLabel,
        })

        if (i === 0) {
          const templateIndex = phase.templates.indexOf(tmpl)
          const assignedDays = trainingDays.filter((_, idx) => idx % phase.templates.length === templateIndex)
          const DAY_MAP: Record<string, number> = {
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
            thursday: 4, friday: 5, saturday: 6,
          }
          for (const day of assignedDays) {
            await this.db.insert(schema.workoutSchedules).values({
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

    return this.getActiveProgram(userId)
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
      phaseComplete ||
      signals.volumePlateau ||
      (signals.averageRpe >= 9 && signals.consecutiveWeeksSinceProgress >= 2)

    if (!needsUpdate) return

    const situationSummary = `${activePhase.type} phase, ${activePhase.completedSessionCount}/${activePhase.targetSessionCount} sessions done, RPE avg ${signals.averageRpe}, plateau: ${signals.volumePlateau}`
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
    } catch { /* proceed without */ }

    const prompt = this.buildAdaptationPrompt(activePhase, { ...signals, isLastPhase }, coachingChunks)
    const raw = await this.callGemini(prompt)
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
    const averageRpe = rpeSets.length > 0
      ? rpeSets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / rpeSets.length
      : 0

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
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
            thursday: 4, friday: 5, saturday: 6,
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
        await this.db
          .update(schema.programs)
          .set({ status: 'completed' })
          .where(eq(schema.programs.id, program.id))
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
