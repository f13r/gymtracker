import type { AnalyzeSuggestion, EquipmentWithExercises, SaveExerciseInput } from '@gymtracker/shared'

import { api } from './client'

export const equipmentApi = {
  list: (): Promise<EquipmentWithExercises[]> => api.get<EquipmentWithExercises[]>('/equipment'),

  analyze: (file: File, equipmentType: string, description: string): Promise<AnalyzeSuggestion> => {
    const form = new FormData()
    form.append('file', file)
    form.append('equipmentType', equipmentType)
    form.append('description', description)
    return api.post<AnalyzeSuggestion>('/equipment/analyze', form)
  },

  create: (
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
    return api.post<EquipmentWithExercises>('/equipment', form)
  },

  delete: (id: string): Promise<void> => api.delete(`/equipment/${id}`),
}
