import { api } from './client';

export const setsApi = {
  logSet: (sessionId: string, data: object) => api.post<any>(`/sessions/${sessionId}/sets`, data),
  updateSet: (sessionId: string, setId: string, data: object) => api.patch<any>(`/sessions/${sessionId}/sets/${setId}`, data),
  deleteSet: (sessionId: string, setId: string) => api.delete(`/sessions/${sessionId}/sets/${setId}`),
};
