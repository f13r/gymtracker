/**
 * Set Pre-population Hierarchy (see CONTEXT.md).
 *
 * When the user is about to log a Set for an Exercise, weight and reps are
 * pre-populated in this priority order:
 *   1. the active Progression Suggestion for that Exercise
 *   2. the last Done Set from the last finished Session for that Exercise
 *   3. the Template default, if the Session was started from a Template
 *
 * Weight and reps are resolved INDEPENDENTLY — each field walks the priority
 * order on its own, skipping null/undefined values. When every source is
 * absent, hardcoded fallbacks are used (0 for weight, 8 for reps), matching the
 * existing frontend behavior.
 */

/** Hardcoded fallback used when every source for that field is null/undefined. */
export const FALLBACK_WEIGHT_KG = 0
export const FALLBACK_REPS = 8

export type PrepopulationSource = 'progression' | 'lastDone' | 'template' | 'fallback'

export interface PrepopulationInputs {
  progression?: { suggestedWeightKg?: number | null; suggestedReps?: number | null } | null
  lastDoneSet?: { weightKg?: number | null; reps?: number | null } | null
  templateDefault?: { defaultWeightKg?: number | null; defaultReps?: number | null } | null
}

export interface PrepopulatedSet {
  weightKg: number
  reps: number
  weightSource: PrepopulationSource
  repsSource: PrepopulationSource
}

/**
 * Resolve a single field by walking the priority order, treating both null and
 * undefined as "absent". Note `0` is a real value and is NOT skipped.
 */
function resolveField(
  candidates: Array<{ source: PrepopulationSource; value: number | null | undefined }>,
  fallback: number,
): { value: number; source: PrepopulationSource } {
  for (const candidate of candidates) {
    if (candidate.value != null) {
      return { value: candidate.value, source: candidate.source }
    }
  }
  return { value: fallback, source: 'fallback' }
}

export function resolvePrepopulatedSet(inputs: PrepopulationInputs): PrepopulatedSet {
  const { progression, lastDoneSet, templateDefault } = inputs

  const weight = resolveField(
    [
      { source: 'progression', value: progression?.suggestedWeightKg },
      { source: 'lastDone', value: lastDoneSet?.weightKg },
      { source: 'template', value: templateDefault?.defaultWeightKg },
    ],
    FALLBACK_WEIGHT_KG,
  )

  const reps = resolveField(
    [
      { source: 'progression', value: progression?.suggestedReps },
      { source: 'lastDone', value: lastDoneSet?.reps },
      { source: 'template', value: templateDefault?.defaultReps },
    ],
    FALLBACK_REPS,
  )

  return {
    weightKg: weight.value,
    reps: reps.value,
    weightSource: weight.source,
    repsSource: reps.source,
  }
}
