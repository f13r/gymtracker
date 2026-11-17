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
  // Archived (still referenced somewhere) or deleted outright (nothing used it).
  remove: (id: string) => api.delete<{ archived: boolean }>(`/exercises/${id}`),
  getArchived: () => api.get<Exercise[]>('/exercises?archived=true'),
  // For naming Exercises something already references (history, logger, Template editor):
  // an Archived Exercise stays named there. Pickers and the library use getAll (live only).
  getAllWithArchived: async () => {
    const [live, archived] = await Promise.all([
      api.get<Exercise[]>('/exercises'),
      api.get<Exercise[]>('/exercises?archived=true'),
    ])
    return [...live, ...archived]
  },
  restore: (id: string) => api.post<Exercise>(`/exercises/${id}/restore`, {}),
  // Stored demonstration media, served by exercise id. Append the row's updatedAt-like key if cache-
  // busting is ever needed; for now the id is stable and images change rarely.
  imageUrl: (id: string) => `/api/exercises/${id}/image`,
  thumbUrl: (id: string) => `/api/exercises/${id}/thumb`,
  getLastSets: (exerciseId: string) => api.get<WorkoutSet[]>(`/exercises/${exerciseId}/last-sets`),
  getProgressionSuggestion: (exerciseId: string) =>
    api.get<ProgressionSuggestion>(`/exercises/${exerciseId}/progression-suggestion`),
}
