export type ProgressionSuggestion = {
  id: string
  userId: string
  exerciseId: string
  suggestedSets: number
  suggestedReps: number
  suggestedWeightKg: number
  reason: string
  evidence: string[]
  createdAt: number
}
