import type { AnalyzeSuggestion, EquipmentWithExercises, SaveExerciseInput } from '@gymtracker/shared'

export const equipmentApi = {
  list: async (): Promise<EquipmentWithExercises[]> => {
    const res = await fetch('/api/equipment')
    if (!res.ok) throw new Error('Failed to load equipment')
    return res.json() as Promise<EquipmentWithExercises[]>
  },

  analyze: async (
    file: File,
    equipmentType: string,
    description: string,
  ): Promise<AnalyzeSuggestion> => {
    const form = new FormData()
    form.append('file', file)
    form.append('equipmentType', equipmentType)
    form.append('description', description)
    const res = await fetch('/api/equipment/analyze', { method: 'POST', body: form })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ message: 'AI analysis failed' }))) as {
        message?: string
      }
      throw new Error(err.message ?? 'AI analysis failed')
    }
    return res.json() as Promise<AnalyzeSuggestion>
  },

  create: async (
    file: File,
    name: string,
    equipmentType: string,
    description: string,
    tags: string[],
    exercises: SaveExerciseInput[],
  ): Promise<EquipmentWithExercises> => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    form.append('equipmentType', equipmentType)
    form.append('description', description)
    form.append('tags', JSON.stringify(tags))
    form.append('exercises', JSON.stringify(exercises))
    const res = await fetch('/api/equipment', { method: 'POST', body: form })
    if (!res.ok) throw new Error('Failed to save equipment')
    return res.json() as Promise<EquipmentWithExercises>
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete equipment')
  },
}
