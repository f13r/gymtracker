export type SuggestedExercise = {
  name: string
  category: string
  equipmentType: string
  tags: string[]
  existingId: string | null
}

export type AnalyzeSuggestion = {
  equipment: { name: string; tags: string[] }
  exercises: SuggestedExercise[]
}

export type SaveExerciseInput = {
  existingId?: string
  name: string
  category: string
  equipmentType: string
}
