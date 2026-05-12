import type { CreateExerciseDto, Exercise, UpdateExerciseDto, WorkoutSet } from '@gymtracker/shared'

import { api } from './client'

export const exercisesApi = {
  getAll: () => api.get<Exercise[]>('/exercises'),
  getOne: (id: string) => api.get<Exercise>(`/exercises/${id}`),
  create: (data: CreateExerciseDto) => api.post<Exercise>('/exercises', data),
  update: (id: string, data: UpdateExerciseDto) => api.patch<Exercise>(`/exercises/${id}`, data),
  remove: (id: string) => api.delete(`/exercises/${id}`),
  getLastSets: (exerciseId: string) => api.get<WorkoutSet[]>(`/exercises/${exerciseId}/last-sets`),
}
