import { Injectable, Inject, Logger } from '@nestjs/common'
import { eq, and, desc, isNotNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { CoachingKnowledgeService } from './coaching-knowledge.service'
import { formatExerciseFacts } from './exercise-facts'
import { ExerciseHistoryService, type ExerciseContext } from './exercise-history.service'
import { isPersistableSuggestion } from './suggestion-validation'
import { GeminiService } from '../ai/gemini.service'
import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { doneSetFilter } from '../drizzle/set-queries'
import { randomUUID } from 'crypto'

type GeminiSuggestionRaw = {
  exerciseId: string
  suggestedSets: number
  suggestedReps: number
  suggestedWeightKg: number
  reason: string
  evidence: string[]
}

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name)

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    private readonly coachingKnowledge: CoachingKnowledgeService,
    private readonly gemini: GeminiService,
    private readonly exerciseHistory: ExerciseHistoryService,
  ) {}

  async getUserContext(userId: string): Promise<{
    age: number | null
    heightCm: number | null
    experienceLevel: string | null
    latestBodyWeightKg: number | null
    goal: string | null
    trainingPhase: string | null
  }> {
    const [profile] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)

    const [latestWeight] = await this.db
      .select({ weightKg: schema.bodyWeights.weightKg })
      .from(schema.bodyWeights)
      .where(eq(schema.bodyWeights.userId, userId))
      .orderBy(desc(schema.bodyWeights.recordedAt))
      .limit(1)

    return {
      age: profile?.age ?? null,
      heightCm: profile?.heightCm ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
      latestBodyWeightKg: latestWeight?.weightKg ?? null,
      goal: profile?.goal ?? null,
      trainingPhase: profile?.trainingPhase ?? null,
    }
  }

  buildSituationSummary(
    exercises: ExerciseContext[],
    user: { experienceLevel: string | null; latestBodyWeightKg: number | null; goal: string | null; trainingPhase: string | null },
  ): string {
    const parts: string[] = []
    if (user.experienceLevel) {parts.push(`Experience level: ${user.experienceLevel}`)}
    if (user.goal) {parts.push(`Goal: ${user.goal}`)}
    if (user.trainingPhase) {parts.push(`Training phase: ${user.trainingPhase}`)}
    if (user.latestBodyWeightKg) {parts.push(`Body weight: ${user.latestBodyWeightKg}kg`)}

    for (const ex of exercises.slice(0, 3)) {
      const f = formatExerciseFacts(ex)
      const twoForTwoInfo = f.twoForTwoTopSets
        ? `last 2 sessions top sets: ${f.twoForTwoTopSets}`
        : 'fewer than 2 prior sessions'
      const e1rmInfo = f.e1rmCurrent !== null ? `e1RM ${f.e1rmCurrent}kg` : 'e1RM n/a'
      parts.push(
        `Exercise: ${f.nameWithCategory}, ` +
        `${f.sessionCount} sessions logged, ` +
        `${f.consecutiveWeeksActive} weeks active, ` +
        `last: ${f.lastSet ?? 'no data'}, ` +
        `${twoForTwoInfo}, ` +
        `PR: ${f.prWeightKg ?? 'none'}kg, ` +
        `${e1rmInfo}, ` +
        `volume trend: ${f.volumeTrend}, ` +
        `category ${f.categoryWeeklySetCount} sets/week, ` +
        `${f.hoursSinceCategorySession !== null ? `${f.hoursSinceCategorySession}h since last ${f.category ?? 'category'} session` : 'no prior category session'}, ` +
        `freq: ${f.weeklyFrequency}/week`,
      )
    }

    return parts.join('. ')
  }

  buildPrompt(
    exercises: ExerciseContext[],
    user: { age: number | null; heightCm: number | null; experienceLevel: string | null; latestBodyWeightKg: number | null; goal: string | null; trainingPhase: string | null },
    coachingChunks: string[] = [],
  ): string {
    const userLine = [
      user.age && `Age: ${user.age}`,
      user.heightCm && `Height: ${user.heightCm}cm`,
      user.experienceLevel && `Experience: ${user.experienceLevel}`,
      user.goal && `Goal: ${user.goal}`,
      user.trainingPhase && `Phase: ${user.trainingPhase}`,
      user.latestBodyWeightKg && `Body weight: ${user.latestBodyWeightKg}kg`,
    ]
      .filter(Boolean)
      .join(' | ')

    const exerciseBlocks = exercises
      .map(ex => {
        const f = formatExerciseFacts(ex)
        const prLine = f.prWeightKg ? `PR: ${f.prWeightKg}kg × ${f.prReps ?? '?'} reps` : 'PR: none recorded'
        const volumeLine = f.volumeSeries
          ? `4-week volume: ${f.volumeSeries}`
          : '4-week volume: insufficient data'
        const twoForTwo = f.twoForTwoTopSets
          ? `Last 2 sessions top sets: ${f.twoForTwoTopSets}`
          : 'Last 2 sessions: insufficient history'
        const e1rmLine =
          f.e1rmCurrent !== null
            ? `Estimated 1RM: ${f.e1rmCurrent}kg (current) | 4-week e1RM trend: ${f.e1rmTrend ?? 'insufficient data'}`
            : null
        return [
          `EXERCISE [${ex.exerciseId}] ${f.nameWithCategory}`,
          `This session: ${f.sessionSets ?? 'no done sets'}`,
          prLine,
          volumeLine,
          ...(e1rmLine ? [e1rmLine] : []),
          twoForTwo,
          `Sessions logged: ${f.sessionCount} | Consecutive weeks active: ${f.consecutiveWeeksActive}`,
          `Category sets/week: ${f.categoryWeeklySetCount} | Hours since last ${f.category ?? 'category'} session: ${f.hoursSinceCategorySession ?? 'unknown'}`,
          `Weekly frequency: ${f.weeklyFrequency} sessions/week`,
        ].join('\n')
      })
      .join('\n\n')

    const coachingSection =
      coachingChunks.length > 0
        ? `COACHING PRINCIPLES (apply these when generating suggestions):\n${coachingChunks.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`
        : ''

    return [
      'You are a certified strength and conditioning coach.',
      'Analyse the training data below and return a progression suggestion for each exercise.',
      'Rules: conservative increments (2.5–5 kg max), always cite specific numbers in evidence[].',
      'You may reference the estimated 1-rep max (e1RM) in plain language in evidence[] when it supports the suggestion (e.g. "estimated 1-rep max rose 118→123kg"). e1RM is a signal — you still own the prescribed sets/reps/weight.',
      'If fewer than 3 sessions of history exist for an exercise, suggest +2–3% and include',
      '"Insufficient history — suggestion will improve as more data accumulates" in evidence[].',
      '',
      coachingSection,
      userLine ? `USER:\n${userLine}` : 'USER: No profile data available.',
      '',
      exerciseBlocks,
    ].join('\n')
  }

  private async callGemini(prompt: string, userId: string): Promise<GeminiSuggestionRaw[]> {
    const parsed = await this.gemini.generateStructured<{ suggestions: GeminiSuggestionRaw[] }>({
      feature: 'progression',
      prompt,
      userId,
      responseSchema: {
        type: 'OBJECT',
        properties: {
          suggestions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                exerciseId:        { type: 'STRING' },
                suggestedSets:     { type: 'INTEGER' },
                suggestedReps:     { type: 'INTEGER' },
                suggestedWeightKg: { type: 'NUMBER' },
                reason:            { type: 'STRING' },
                evidence:          { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['exerciseId', 'suggestedSets', 'suggestedReps',
                         'suggestedWeightKg', 'reason', 'evidence'],
            },
          },
        },
        required: ['suggestions'],
      },
    })
    return parsed.suggestions ?? []
  }

  async generateForSession(sessionId: string, userId: string): Promise<void> {
    const doneRows = await this.db
      .selectDistinct({ exerciseId: schema.sets.exerciseId })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), doneSetFilter, isNotNull(schema.sets.exerciseId)))

    if (doneRows.length === 0) {return}

    const [userCtx, ...exerciseContexts] = await Promise.all([
      this.getUserContext(userId),
      ...doneRows.map(r => this.exerciseHistory.buildExerciseContext(r.exerciseId!, userId, sessionId)),
    ])

    const validContexts = exerciseContexts.filter((c): c is ExerciseContext => c !== null)
    if (validContexts.length === 0) {return}

    const situationSummary = this.buildSituationSummary(validContexts, userCtx)
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary, userId)
    } catch (err) {
      this.logger.warn('Coaching knowledge retrieval failed, proceeding without coaching context', err)
    }

    const prompt = this.buildPrompt(validContexts, userCtx, coachingChunks)

    let suggestions: GeminiSuggestionRaw[]
    try {
      suggestions = await this.callGemini(prompt, userId)
    } catch (err) {
      this.logger.error(`Gemini call failed for session ${sessionId}`, err)
      return
    }

    const now = Math.floor(Date.now() / 1000)
    for (const s of suggestions) {
      if (!isPersistableSuggestion(s)) {continue}
      await this.db
        .insert(schema.progressionSuggestions)
        .values({
          id: randomUUID(),
          userId,
          exerciseId: s.exerciseId,
          suggestedSets: s.suggestedSets,
          suggestedReps: s.suggestedReps,
          suggestedWeightKg: s.suggestedWeightKg,
          reason: s.reason,
          evidence: JSON.stringify(s.evidence),
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.progressionSuggestions.userId, schema.progressionSuggestions.exerciseId],
          set: {
            suggestedSets: s.suggestedSets,
            suggestedReps: s.suggestedReps,
            suggestedWeightKg: s.suggestedWeightKg,
            reason: s.reason,
            evidence: JSON.stringify(s.evidence),
            createdAt: now,
          },
        })
    }

    this.logger.log(`Generated ${suggestions.length} progression suggestions for session ${sessionId}`)
  }

  async getForExercise(exerciseId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(schema.progressionSuggestions)
      .where(
        and(
          eq(schema.progressionSuggestions.exerciseId, exerciseId),
          eq(schema.progressionSuggestions.userId, userId),
        ),
      )
      .limit(1)

    if (!row) {return null}

    return {
      id: row.id,
      userId: row.userId,
      exerciseId: row.exerciseId,
      suggestedSets: row.suggestedSets,
      suggestedReps: row.suggestedReps,
      suggestedWeightKg: row.suggestedWeightKg,
      reason: row.reason,
      evidence: JSON.parse(row.evidence) as string[],
      createdAt: row.createdAt,
    }
  }
}
