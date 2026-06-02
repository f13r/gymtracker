import type { ExerciseContext } from './exercise-history.service'

/**
 * Pre-formatted, named fragments derived from one Exercise's training-history
 * view. This is the single source of per-Exercise fact formatting: both the
 * embedding-retrieval situation summary and the full coach prompt compose the
 * verbosity they need from these fragments, so the two can no longer drift
 * apart (see issue #8, finding 2). Pure — no DB, no I/O.
 */
export type ExerciseFactFragments = {
  /** "Bench Press (push)" — name with optional category suffix. */
  nameWithCategory: string
  /** The last done set this session, "80kg×8 @RPE7", or null if none. */
  lastSet: string | null
  /** All done sets this session, "set1 80kg×8 @RPE7, set2 ...", or null if none. */
  sessionSets: string | null
  /** Top sets of the last two sessions, "80kg×10, 80kg×11", or null if fewer than two. */
  twoForTwoTopSets: string | null
  /** Categorical 4-week volume trend. */
  volumeTrend: 'increasing' | 'flat or decreasing' | 'insufficient data'
  /** 4-week volume series, "1920kg → 2010kg", or null if no data. */
  volumeSeries: string | null
  /** Best e1RM over the last 4 weeks, rounded, or null if no qualifying sets. */
  e1rmCurrent: number | null
  /** 4-week e1RM trend across populated weeks, "117 → 132kg", or null if none. */
  e1rmTrend: string | null
  /** Raw passthroughs — interpolated with consumer-specific labels. */
  prWeightKg: number | null
  prReps: number | null
  category: string | null
  categoryWeeklySetCount: number
  hoursSinceCategorySession: number | null
  weeklyFrequency: number
  sessionCount: number
  consecutiveWeeksActive: number
}

type DoneSet = { weightKg: number | null; reps: number | null; rpe?: number | null }

/** "80kg×8 @RPE7" — a single done set; RPE omitted when absent. */
function formatSet(s: DoneSet): string {
  return `${s.weightKg ?? 0}kg×${s.reps ?? 0}${s.rpe ? ` @RPE${s.rpe}` : ''}`
}

/** "80kg×8" — a top set without RPE. */
function formatTopSet(s: { weightKg: number | null; reps: number | null }): string {
  return `${s.weightKg ?? 0}kg×${s.reps ?? 0}`
}

export function formatExerciseFacts(ex: ExerciseContext): ExerciseFactFragments {
  const last = ex.lastSets.at(-1)

  const volumeTrend: ExerciseFactFragments['volumeTrend'] =
    ex.weeklyVolumes.length >= 2
      ? ex.weeklyVolumes.at(-1)!.volume > ex.weeklyVolumes.at(-2)!.volume
        ? 'increasing'
        : 'flat or decreasing'
      : 'insufficient data'

  return {
    nameWithCategory: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
    lastSet: last ? formatSet(last) : null,
    sessionSets:
      ex.lastSets.length > 0
        ? ex.lastSets.map(s => `set${s.setNumber} ${formatSet(s)}`).join(', ')
        : null,
    twoForTwoTopSets:
      ex.lastTwoSessions.length === 2
        ? ex.lastTwoSessions.map(formatTopSet).join(', ')
        : null,
    volumeTrend,
    volumeSeries:
      ex.weeklyVolumes.length > 0
        ? ex.weeklyVolumes.map(v => `${v.volume.toFixed(0)}kg`).join(' → ')
        : null,
    e1rmCurrent: ex.currentE1rmKg !== null ? Math.round(ex.currentE1rmKg) : null,
    e1rmTrend:
      ex.e1rmTrend.length > 0
        ? `${ex.e1rmTrend.map(v => Math.round(v)).join(' → ')}kg`
        : null,
    prWeightKg: ex.prWeightKg,
    prReps: ex.prReps,
    category: ex.category,
    categoryWeeklySetCount: ex.categoryWeeklySetCount,
    hoursSinceCategorySession: ex.hoursSinceCategorySession,
    weeklyFrequency: ex.weeklyFrequency,
    sessionCount: ex.sessionCount,
    consecutiveWeeksActive: ex.consecutiveWeeksActive,
  }
}
