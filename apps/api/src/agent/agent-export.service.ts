import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gte, isNotNull } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import {
  AGENT_WEEKDAYS,
  type AgentApplyResult,
  type AgentExerciseSummary,
  type AgentExport,
  type AgentTemplateExport,
  type AgentWeekday,
} from '@gymtracker/shared'

import { DATABASE } from '../drizzle/drizzle.constants'
import * as schema from '../drizzle/schema'

type Db = NodePgDatabase<typeof schema>

const RECENT_CHANGES = 5

/** A unix time as the server's local calendar date, `YYYY-MM-DD`. */
export function localDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Superset markers as short labels: each group's id becomes "A", "B", … in order of first
 * appearance, so two lists with the same grouping read (and compare) the same.
 */
export function supersetLabels(groups: (string | null | undefined)[]): (string | undefined)[] {
  const labels = new Map<string, string>()
  return groups.map(group => {
    if (!group) {
      return undefined
    }
    if (!labels.has(group)) {
      labels.set(group, String.fromCharCode(65 + (labels.size % 26)) + (labels.size >= 26 ? labels.size : ''))
    }
    return labels.get(group)
  })
}

/** A User's Templates in the apply document's shape, sorted by name. */
export async function loadTemplatesForExport(db: Db, userId: string, exerciseNames: Map<string, string>) {
  const templates = await db.select().from(schema.workoutTemplates).where(eq(schema.workoutTemplates.userId, userId))
  const result: (AgentTemplateExport & { id: string })[] = []
  for (const t of templates) {
    const rows = (
      await db.select().from(schema.templateExercises).where(eq(schema.templateExercises.templateId, t.id))
    ).sort((a, b) => a.orderIndex - b.orderIndex)
    const labels = supersetLabels(rows.map(r => r.supersetGroup))
    result.push({
      id: t.id,
      name: t.name,
      notes: t.notes,
      exercises: rows.map((r, i) => ({
        exercise: exerciseNames.get(r.exerciseId ?? '') ?? '(unknown exercise)',
        sets: r.defaultSets,
        reps: r.defaultReps,
        weightKg: r.defaultWeightKg,
        ...(labels[i] ? { supersetGroup: labels[i] } : {}),
      })),
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

type HistoryRow = {
  exerciseId: string | null
  sessionId: string | null
  startedAt: number
  reps: number | null
  weightKg: number | null
  done: number | null
  removedAt: number | null
}

/** Per-Exercise training summary of finished Sessions' Sets; Exercises sorted by name. */
export function summarizeHistory(rows: HistoryRow[], exerciseNames: Map<string, string>): AgentExerciseSummary[] {
  const byExercise = new Map<string, HistoryRow[]>()
  for (const row of rows) {
    if (row.exerciseId) {
      byExercise.set(row.exerciseId, [...(byExercise.get(row.exerciseId) ?? []), row])
    }
  }
  const summaries: AgentExerciseSummary[] = []
  for (const [exerciseId, sets] of byExercise) {
    const done = sets.filter(s => s.done === 1 && s.removedAt == null)
    let best: HistoryRow | undefined
    for (const s of done) {
      if (s.weightKg != null && s.weightKg > 0) {
        const better =
          !best ||
          s.weightKg > (best.weightKg ?? 0) ||
          (s.weightKg === best.weightKg && (s.reps ?? 0) > (best.reps ?? 0))
        best = better ? s : best
      }
    }
    summaries.push({
      exercise: exerciseNames.get(exerciseId) ?? '(unknown exercise)',
      sessions: new Set(sets.map(s => s.sessionId)).size,
      dates: [...new Set(sets.map(s => localDate(s.startedAt)))].sort(),
      doneSets: done.length,
      missedSets: sets.filter(s => s.done !== 1 && s.removedAt == null).length,
      removedSets: sets.filter(s => s.removedAt != null).length,
      bestSet: best ? { weightKg: best.weightKg!, reps: best.reps, date: localDate(best.startedAt) } : null,
      volumeKg: done.reduce((sum, s) => sum + (s.reps ?? 0) * (s.weightKg ?? 0), 0),
    })
  }
  return summaries.sort((a, b) => a.exercise.localeCompare(b.exercise))
}

/** What the Agent reads before writing: the shared library and, for one named User, their plan and history. */
@Injectable()
export class AgentExportService {
  constructor(@Inject(DATABASE) private db: Db) {}

  async export(opts: { userId?: string | undefined; weeks: number }): Promise<AgentExport> {
    const exercises = (await this.db.select().from(schema.exercises)).sort((a, b) => a.name.localeCompare(b.name))
    const names = new Map(exercises.map(e => [e.id, e.name]))
    const result: AgentExport = {
      generatedAt: new Date().toISOString(),
      exercises: exercises.map(e => ({
        name: e.name,
        category: e.category,
        equipmentType: e.equipmentType,
        description: e.description,
        hasImage: e.imagePath != null,
        archived: e.archivedAt != null,
      })),
      recentChanges: await this.recentChanges(RECENT_CHANGES, opts.userId),
    }
    if (opts.userId) {
      result.user = await this.userPart(opts.userId, opts.weeks, names)
    }
    return result
  }

  /** The latest applied documents, newest first, optionally only those for one User. */
  async changes(limit: number, userId?: string) {
    const t = schema.agentChanges
    const rows = await this.db
      .select()
      .from(t)
      .where(userId ? eq(t.targetUserId, userId) : undefined)
      .orderBy(desc(t.createdAt))
      .limit(limit)
    return rows.map(r => ({
      id: r.id,
      createdAt: new Date(r.createdAt * 1000).toISOString(),
      targetUserId: r.targetUserId,
      document: r.document,
      diff: r.diff as AgentApplyResult,
    }))
  }

  private async recentChanges(limit: number, userId?: string) {
    return (await this.changes(limit, userId)).map(c => ({
      id: c.id,
      createdAt: c.createdAt,
      targetUserId: c.targetUserId,
      summary: c.diff?.summary ?? {},
    }))
  }

  private async userPart(
    userId: string,
    weeks: number,
    names: Map<string, string>,
  ): Promise<NonNullable<AgentExport['user']>> {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    if (!user) {
      throw new NotFoundException(`No User "${userId}"`)
    }
    const [profile] = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)
    const templates = await loadTemplatesForExport(this.db, userId, names)
    const templateNames = new Map(templates.map(t => [t.id, t.name]))

    const s = schema.workoutSchedules
    const weeklyRows = (
      await this.db
        .select()
        .from(s)
        .where(and(eq(s.userId, userId), eq(s.type, 'weekly')))
    ).sort((a, b) => a.createdAt - b.createdAt)
    const weekly = Object.fromEntries(
      Object.entries(AGENT_WEEKDAYS).map(([day, dow]) => {
        const row = weeklyRows.find(r => r.dayOfWeek === dow)
        return [day, row ? (templateNames.get(row.templateId ?? '') ?? null) : null]
      }),
    ) as Record<AgentWeekday, string | null>

    const to = Math.floor(Date.now() / 1000)
    const from = to - weeks * 7 * 86400
    const ws = schema.workoutSessions
    const rows = await this.db
      .select({
        exerciseId: schema.sets.exerciseId,
        sessionId: schema.sets.sessionId,
        startedAt: ws.startedAt,
        reps: schema.sets.reps,
        weightKg: schema.sets.weightKg,
        done: schema.sets.done,
        removedAt: schema.sets.removedAt,
      })
      .from(schema.sets)
      .innerJoin(ws, eq(ws.id, schema.sets.sessionId))
      .where(and(eq(ws.userId, userId), isNotNull(ws.finishedAt), gte(ws.startedAt, from)))
      .orderBy(asc(ws.startedAt))

    return {
      id: user.id,
      displayName: user.displayName,
      profile: profile
        ? {
            age: profile.age,
            heightCm: profile.heightCm,
            gender: profile.gender,
            experienceLevel: profile.experienceLevel,
            goal: profile.goal,
            trainingPhase: profile.trainingPhase,
            trainingDays: profile.trainingDays ? (JSON.parse(profile.trainingDays) as string[]) : null,
            sessionDurationMinutes: profile.sessionDurationMinutes,
          }
        : null,
      templates: templates.map(t => ({ name: t.name, notes: t.notes, exercises: t.exercises })),
      weekly,
      history: {
        weeks,
        from: localDate(from),
        to: localDate(to),
        // The window is also applied here, so the summary never depends on the query honouring it.
        exercises: summarizeHistory(
          rows.filter(r => r.startedAt >= from),
          names,
        ),
      },
    }
  }
}
