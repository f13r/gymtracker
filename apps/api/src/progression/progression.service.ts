import { randomUUID } from 'crypto'

import { Injectable, Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { eq, and, sql, desc, isNotNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'
import { CoachingKnowledgeService } from './coaching-knowledge.service'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type GeminiSuggestionRaw = {
  exerciseId: string
  suggestedSets: number
  suggestedReps: number
  suggestedWeightKg: number
  reason: string
  evidence: string[]
}

type ExerciseContext = {
  exerciseId: string
  name: string
  category: string | null
  lastSets: { setNumber: number; weightKg: number | null; reps: number | null; rpe: number | null }[]
  prWeightKg: number | null
  prReps: number | null
  weeklyVolumes: { week: string; volume: number }[]
  weeklyFrequency: number
  sessionCount: number
  lastTwoSessions: { weightKg: number | null; reps: number | null }[]
  categoryWeeklySetCount: number
  hoursSinceCategorySession: number | null
  consecutiveWeeksActive: number
}

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name)
  private readonly geminiApiKey: string

  constructor(
    @Inject(DATABASE) private db: NodePgDatabase<typeof schema>,
    config: ConfigService,
    private readonly coachingKnowledge: CoachingKnowledgeService,
  ) {
    this.geminiApiKey = config.getOrThrow<string>('GEMINI_API_KEY')
  }

  async buildExerciseContext(
    exerciseId: string,
    userId: string,
    sessionId: string,
  ): Promise<ExerciseContext | null> {
    const [exercise] = await this.db
      .select({ name: schema.exercises.name, category: schema.exercises.category })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId))
      .limit(1)
    if (!exercise) return null

    const sessionSets = await this.db
      .select({
        setNumber: schema.sets.setNumber,
        weightKg: schema.sets.weightKg,
        reps: schema.sets.reps,
        rpe: schema.sets.rpe,
      })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), eq(schema.sets.exerciseId, exerciseId), eq(schema.sets.done, 1)))
      .orderBy(schema.sets.setNumber)

    const prResult = await this.db.execute(sql`
      SELECT s.weight_kg AS "weightKg", s.reps
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId} AND s.done = 1
        AND ws.finished_at IS NOT NULL
      ORDER BY s.weight_kg DESC NULLS LAST
      LIMIT 1
    `)
    const pr = prResult.rows[0] as { weightKg: number | null; reps: number | null } | undefined

    const volumeResult = await this.db.execute(sql`
      SELECT
        to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week,
        SUM(s.reps * s.weight_kg) AS volume
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId}
        AND s.exercise_id = ${exerciseId}
        AND s.done = 1
        AND s.completed_at > extract(epoch from now() - interval '4 weeks')
      GROUP BY week
      ORDER BY week
    `)

    const freqResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT to_char(to_timestamp(started_at), 'IYYY-"W"IW')) AS weeks_active
      FROM workout_sessions
      WHERE user_id = ${userId}
        AND finished_at IS NOT NULL
        AND started_at > extract(epoch from now() - interval '4 weeks')
    `)
    const weeklyFrequency = Number((freqResult.rows[0] as { weeks_active: string })?.weeks_active ?? 0)

    const sessionCountResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT s.session_id) AS cnt
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
    `)
    const sessionCount = Number((sessionCountResult.rows[0] as { cnt: string })?.cnt ?? 0)

    const lastTwoResult = await this.db.execute(sql`
      SELECT s.weight_kg AS "weightKg", s.reps
      FROM sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
        AND ws.id != ${sessionId}
      ORDER BY ws.finished_at DESC NULLS LAST, s.weight_kg DESC NULLS LAST
      LIMIT 2
    `)
    const lastTwoSessions = lastTwoResult.rows as { weightKg: number | null; reps: number | null }[]

    const catSetsResult = await this.db.execute(sql`
      SELECT AVG(weekly_sets) AS avg_sets
      FROM (
        SELECT to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week,
               COUNT(*) AS weekly_sets
        FROM sets s
        JOIN workout_sessions ws ON ws.id = s.session_id
        JOIN exercises e ON e.id = s.exercise_id
        WHERE ws.user_id = ${userId} AND e.category = ${exercise.category}
          AND s.done = 1
          AND s.completed_at > extract(epoch from now() - interval '4 weeks')
        GROUP BY week
      ) t
    `)
    const categoryWeeklySetCount = Math.round(Number((catSetsResult.rows[0] as { avg_sets: string })?.avg_sets ?? 0))

    const catLastResult = await this.db.execute(sql`
      SELECT MAX(ws.finished_at) AS last_at
      FROM workout_sessions ws
      JOIN sets s ON s.session_id = ws.id
      JOIN exercises e ON e.id = s.exercise_id
      WHERE ws.user_id = ${userId} AND e.category = ${exercise.category}
        AND s.done = 1 AND ws.finished_at IS NOT NULL
        AND ws.id != ${sessionId}
    `)
    const lastCatAt = (catLastResult.rows[0] as { last_at: number | null })?.last_at
    const hoursSinceCategorySession = lastCatAt
      ? Math.round((Date.now() / 1000 - lastCatAt) / 3600)
      : null

    const consWeeksResult = await this.db.execute(sql`
      WITH weekly AS (
        SELECT DISTINCT to_char(to_timestamp(s.completed_at), 'IYYY-"W"IW') AS week
        FROM sets s
        JOIN workout_sessions ws ON ws.id = s.session_id
        WHERE ws.user_id = ${userId} AND s.exercise_id = ${exerciseId}
          AND s.done = 1 AND ws.finished_at IS NOT NULL
        ORDER BY week DESC
      ),
      ranked AS (
        SELECT week,
               ROW_NUMBER() OVER (ORDER BY week DESC) AS rn,
               to_char(
                 (SELECT MAX(to_timestamp(s2.completed_at))
                  FROM sets s2 JOIN workout_sessions ws2 ON ws2.id = s2.session_id
                  WHERE ws2.user_id = ${userId} AND s2.exercise_id = ${exerciseId} AND s2.done = 1)
                 - (rn - 1) * interval '1 week',
                 'IYYY-"W"IW'
               ) AS expected_week
        FROM weekly
      )
      SELECT COUNT(*) AS consecutive
      FROM ranked
      WHERE week = expected_week
    `)
    const consecutiveWeeksActive = Number((consWeeksResult.rows[0] as { consecutive: string })?.consecutive ?? 1)

    return {
      exerciseId,
      name: exercise.name,
      category: exercise.category,
      lastSets: sessionSets,
      prWeightKg: pr?.weightKg ?? null,
      prReps: pr?.reps ?? null,
      weeklyVolumes: (volumeResult.rows as { week: string; volume: string }[]).map(r => ({
        week: r.week,
        volume: Number(r.volume),
      })),
      weeklyFrequency,
      sessionCount,
      lastTwoSessions,
      categoryWeeklySetCount,
      hoursSinceCategorySession,
      consecutiveWeeksActive,
    }
  }

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
    if (user.experienceLevel) parts.push(`Experience level: ${user.experienceLevel}`)
    if (user.goal) parts.push(`Goal: ${user.goal}`)
    if (user.trainingPhase) parts.push(`Training phase: ${user.trainingPhase}`)
    if (user.latestBodyWeightKg) parts.push(`Body weight: ${user.latestBodyWeightKg}kg`)

    for (const ex of exercises.slice(0, 3)) {
      const lastSet = ex.lastSets.at(-1)
      const volumeTrend =
        ex.weeklyVolumes.length >= 2
          ? ex.weeklyVolumes.at(-1)!.volume > ex.weeklyVolumes.at(-2)!.volume
            ? 'increasing'
            : 'flat or decreasing'
          : 'insufficient data'
      const twoForTwoInfo =
        ex.lastTwoSessions.length === 2
          ? `last 2 sessions top sets: ${ex.lastTwoSessions.map(s => `${s.weightKg ?? 0}kg×${s.reps ?? 0}`).join(', ')}`
          : 'fewer than 2 prior sessions'
      parts.push(
        `Exercise: ${ex.name}${ex.category ? ` (${ex.category})` : ''}, ` +
        `${ex.sessionCount} sessions logged, ` +
        `${ex.consecutiveWeeksActive} weeks active, ` +
        `last: ${lastSet ? `${lastSet.weightKg ?? 0}kg×${lastSet.reps ?? 0}${lastSet.rpe ? ` @RPE${lastSet.rpe}` : ''}` : 'no data'}, ` +
        `${twoForTwoInfo}, ` +
        `PR: ${ex.prWeightKg ?? 'none'}kg, ` +
        `volume trend: ${volumeTrend}, ` +
        `category ${ex.categoryWeeklySetCount} sets/week, ` +
        `${ex.hoursSinceCategorySession !== null ? `${ex.hoursSinceCategorySession}h since last ${ex.category ?? 'category'} session` : 'no prior category session'}, ` +
        `freq: ${ex.weeklyFrequency}/week`,
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
        const setsLine = ex.lastSets
          .map(s => `set${s.setNumber} ${s.weightKg ?? 0}kg×${s.reps ?? 0}${s.rpe ? ` @RPE${s.rpe}` : ''}`)
          .join(', ')
        const prLine = ex.prWeightKg ? `PR: ${ex.prWeightKg}kg × ${ex.prReps ?? '?'} reps` : 'PR: none recorded'
        const volumeLine =
          ex.weeklyVolumes.length > 0
            ? `4-week volume: ${ex.weeklyVolumes.map(v => `${v.volume.toFixed(0)}kg`).join(' → ')}`
            : '4-week volume: insufficient data'
        const twoForTwo =
          ex.lastTwoSessions.length === 2
            ? `Last 2 sessions top sets: ${ex.lastTwoSessions.map(s => `${s.weightKg ?? 0}kg×${s.reps ?? 0}`).join(', ')}`
            : 'Last 2 sessions: insufficient history'
        return [
          `EXERCISE [${ex.exerciseId}] ${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
          `This session: ${setsLine || 'no done sets'}`,
          prLine,
          volumeLine,
          twoForTwo,
          `Sessions logged: ${ex.sessionCount} | Consecutive weeks active: ${ex.consecutiveWeeksActive}`,
          `Category sets/week: ${ex.categoryWeeklySetCount} | Hours since last ${ex.category ?? 'category'} session: ${ex.hoursSinceCategorySession ?? 'unknown'}`,
          `Weekly frequency: ${ex.weeklyFrequency} sessions/week`,
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
      'If fewer than 3 sessions of history exist for an exercise, suggest +2–3% and include',
      '"Insufficient history — suggestion will improve as more data accumulates" in evidence[].',
      '',
      coachingSection,
      userLine ? `USER:\n${userLine}` : 'USER: No profile data available.',
      '',
      exerciseBlocks,
    ].join('\n')
  }

  private async callGemini(prompt: string): Promise<GeminiSuggestionRaw[]> {
    const response = await fetch(`${GEMINI_URL}?key=${this.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
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
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)')
      throw new Error(`Gemini ${response.status}: ${body}`)
    }

    const json = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned empty response')

    const parsed = JSON.parse(text) as { suggestions: GeminiSuggestionRaw[] }
    return parsed.suggestions ?? []
  }

  async generateForSession(sessionId: string, userId: string): Promise<void> {
    const doneRows = await this.db
      .selectDistinct({ exerciseId: schema.sets.exerciseId })
      .from(schema.sets)
      .where(and(eq(schema.sets.sessionId, sessionId), eq(schema.sets.done, 1), isNotNull(schema.sets.exerciseId)))

    if (doneRows.length === 0) return

    const [userCtx, ...exerciseContexts] = await Promise.all([
      this.getUserContext(userId),
      ...doneRows.map(r => this.buildExerciseContext(r.exerciseId!, userId, sessionId)),
    ])

    const validContexts = exerciseContexts.filter((c): c is ExerciseContext => c !== null)
    if (validContexts.length === 0) return

    const situationSummary = this.buildSituationSummary(validContexts, userCtx)
    let coachingChunks: string[] = []
    try {
      coachingChunks = await this.coachingKnowledge.retrieveForSituation(situationSummary)
    } catch (err) {
      this.logger.warn('Coaching knowledge retrieval failed, proceeding without coaching context', err)
    }

    const prompt = this.buildPrompt(validContexts, userCtx, coachingChunks)

    let suggestions: GeminiSuggestionRaw[]
    try {
      suggestions = await this.callGemini(prompt)
    } catch (err) {
      this.logger.error(`Gemini call failed for session ${sessionId}`, err)
      return
    }

    const now = Math.floor(Date.now() / 1000)
    for (const s of suggestions) {
      if (!s.exerciseId || !s.suggestedSets || !s.suggestedReps || !s.suggestedWeightKg || !s.evidence) continue
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

    if (!row) return null

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
