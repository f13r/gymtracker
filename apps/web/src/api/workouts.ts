import type {
  CreateTemplateDto,
  SessionWithSets,
  StartSessionDto,
  WorkoutSession,
  WorkoutTemplateWithExercises,
} from '@gymtracker/shared'

import { api } from './client'

export const workoutsApi = {
  getTemplates: () => api.get<WorkoutTemplateWithExercises[]>('/templates'),
  getTemplate: (id: string) => api.get<WorkoutTemplateWithExercises>(`/templates/${id}`),
  createTemplate: (data: CreateTemplateDto) => api.post<WorkoutTemplateWithExercises>('/templates', data),
  deleteTemplate: (id: string) => api.delete(`/templates/${id}`),
  getSessions: () => api.get<WorkoutSession[]>('/sessions'),
  startSession: (data: StartSessionDto) => api.post<SessionWithSets>('/sessions', data),
  getSession: (id: string) => api.get<SessionWithSets>(`/sessions/${id}`),
  getActiveSession: () => api.get<WorkoutSession | null>('/sessions/active'),
  finishSession: (id: string, notes?: string) => api.post<SessionWithSets>(`/sessions/${id}/finish`, { notes }),
  deleteSession: (id: string) => api.delete(`/sessions/${id}`),
}
