import type {
  CreateExerciseDto,
  Exercise,
  ProgressionSuggestion,
  UpdateExerciseDto,
  WorkoutSet,
} from '@gymtracker/shared'

import { api } from './client'

// Exercise create/update go over multipart so an optional photo rides along with the fields.
function toFormData(data: Record<string, unknown>, image?: File | null): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      fd.append(key, String(value))
    }
  }
  if (image) {
    fd.append('image', image)
  }
  return fd
}

export const exercisesApi = {
  getAll: () => api.get<Exercise[]>('/exercises'),
  getOne: (id: string) => api.get<Exercise>(`/exercises/${id}`),
  create: (data: CreateExerciseDto, image?: File | null) => api.post<Exercise>('/exercises', toFormData(data, image)),
  update: (id: string, data: UpdateExerciseDto, image?: File | null, removeImage?: boolean) =>
    api.patch<Exercise>(
      `/exercises/${id}`,
      toFormData({ ...data, ...(removeImage ? { removeImage: true } : {}) }, image),
    ),
  remove: (id: string) => api.delete(`/exercises/${id}`),
  // Stored demonstration media, served by exercise id. Append the row's updatedAt-like key if cache-
  // busting is ever needed; for now the id is stable and images change rarely.
  imageUrl: (id: string) => `/api/exercises/${id}/image`,
  thumbUrl: (id: string) => `/api/exercises/${id}/thumb`,
  getLastSets: (exerciseId: string) => api.get<WorkoutSet[]>(`/exercises/${exerciseId}/last-sets`),
  getProgressionSuggestion: (exerciseId: string) =>
    api.get<ProgressionSuggestion>(`/exercises/${exerciseId}/progression-suggestion`),
}
