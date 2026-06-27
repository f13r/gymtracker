import { useQuery } from '@tanstack/react-query'

import type { PrepopulatedSet, ProgressionSuggestion, WorkoutSet } from '@gymtracker/shared'
import { resolvePrepopulatedSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'

interface PrepopulatedExercise {
  id: string
  defaultWeightKg: number
  defaultReps: number
}

interface UsePrepopulatedSetResult {
  /** The resolved pending Set (weight/reps + their sources). */
  prepopulated: PrepopulatedSet
  /** Last finished Session's sets for this Exercise (most recent last). */
  prevSets: WorkoutSet[]
  /** The last Done Set, used for the "Previous: …" hint. */
  lastDoneSet: WorkoutSet | undefined
  /** Active progression suggestion, if any. */
  progressionSuggestion: ProgressionSuggestion | null | undefined
}

/**
 * Single frontend seam for the Set Pre-population Hierarchy.
 *
 * Owns the per-exercise queries (progression suggestion + last-done sets) and
 * folds them, together with the template defaults carried on the exercise, into
 * the shared `resolvePrepopulatedSet` resolver. The `prepopulated` value is the
 * source-of-truth for what a pending Set should be pre-filled with; the raw
 * query data is returned alongside for rendering hints/summaries.
 */
export function usePrepopulatedSet(currentExercise: PrepopulatedExercise | undefined): UsePrepopulatedSetResult {
  const exerciseId = currentExercise?.id

  const { data: prevSets = [] } = useQuery({
    queryKey: queryKeys.exerciseLastSets(exerciseId),
    queryFn: () => exercisesApi.getLastSets(exerciseId!),
    enabled: !!exerciseId,
    staleTime: 60_000,
  })

  const { data: progressionSuggestion } = useQuery({
    queryKey: queryKeys.progressionSuggestion(exerciseId),
    queryFn: () => exercisesApi.getProgressionSuggestion(exerciseId!),
    enabled: !!exerciseId,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const lastDoneSet = prevSets.at(-1)

  const prepopulated = resolvePrepopulatedSet({
    progression: progressionSuggestion,
    lastDoneSet,
    templateDefault: currentExercise
      ? {
          defaultWeightKg: currentExercise.defaultWeightKg,
          defaultReps: currentExercise.defaultReps,
        }
      : null,
  })

  return { prepopulated, prevSets, lastDoneSet, progressionSuggestion }
}
