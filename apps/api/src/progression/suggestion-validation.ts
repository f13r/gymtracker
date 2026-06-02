/**
 * A raw progression suggestion as returned by the model, before validation.
 * Fields are optional/nullable here because the model can omit or null any of
 * them; `isPersistableSuggestion` decides whether the object is complete enough
 * to persist.
 */
export type RawSuggestion = {
  exerciseId?: string | null | undefined
  suggestedSets?: number | null | undefined
  suggestedReps?: number | null | undefined
  suggestedWeightKg?: number | null | undefined
  reason?: string | null | undefined
  evidence?: string[] | null | undefined
}

/**
 * Decides whether a raw model suggestion is complete enough to persist.
 *
 * Required fields (exercise identifier, sets, reps, weight, evidence) must be
 * PRESENT — but a numeric value of `0` is a real, valid prescription (every
 * bodyweight Exercise suggests `0 kg`) and must NOT be treated as absent. This
 * mirrors the null-vs-zero discipline in the Set Pre-population resolver
 * (`resolveField` skips only `null`/`undefined`), so the two AI-ingestion paths
 * agree. `reason` is not required.
 */
export function isPersistableSuggestion(s: RawSuggestion): boolean {
  return (
    typeof s.exerciseId === 'string' &&
    s.exerciseId.length > 0 &&
    s.suggestedSets != null &&
    s.suggestedReps != null &&
    s.suggestedWeightKg != null &&
    Array.isArray(s.evidence) &&
    s.evidence.length > 0
  )
}
