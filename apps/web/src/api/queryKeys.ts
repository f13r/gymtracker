/**
 * Centralized, typed React Query key factory.
 *
 * Each function returns the SAME array shape that was previously written as a
 * string literal at the call site, so cache identity and invalidation behavior
 * are unchanged. Use these everywhere instead of inline `['...']` arrays so the
 * keys can never silently drift between a `useQuery` and its `invalidateQueries`.
 */
type Id = string | null | undefined

export const queryKeys = {
  profile: () => ['profile'] as const,
  exercises: () => ['exercises'] as const,
  session: (id: Id) => ['session', id] as const,
  template: (id: Id) => ['template', id] as const,
  exerciseLastSets: (id: Id) => ['exercise-last-sets', id] as const,
  progressionSuggestion: (id: Id) => ['progression-suggestion', id] as const,
  schedules: () => ['schedules'] as const,
  activeSession: () => ['activeSession'] as const,
  sessions: () => ['sessions'] as const,
}
