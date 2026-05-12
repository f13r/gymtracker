import type { CreateSetDto, UpdateSetDto, WorkoutSet } from '@gymtracker/shared'

import { api } from './client'

export const setsApi = {
  logSet: (sessionId: string, data: CreateSetDto) => api.post<WorkoutSet>(`/sessions/${sessionId}/sets`, data),
  updateSet: (sessionId: string, setId: string, data: UpdateSetDto) =>
    api.patch<WorkoutSet>(`/sessions/${sessionId}/sets/${setId}`, data),
  deleteSet: (sessionId: string, setId: string) => api.delete(`/sessions/${sessionId}/sets/${setId}`),
}
