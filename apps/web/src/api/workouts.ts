import { api } from './client';

export const workoutsApi = {
  getTemplates: () => api.get<any[]>('/templates'),
  getSessions: () => api.get<any[]>('/sessions'),
  startSession: (data: { name: string; templateId?: string }) => api.post<any>('/sessions', data),
  getSession: (id: string) => api.get<any>(`/sessions/${id}`),
  getActiveSession: () => api.get<any | null>('/sessions/active'),
  finishSession: (id: string, notes?: string) => api.post<any>(`/sessions/${id}/finish`, { notes }),
};
