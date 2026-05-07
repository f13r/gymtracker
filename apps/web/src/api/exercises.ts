import { api } from './client';

export const exercisesApi = {
  getAll: () => api.get<any[]>('/exercises'),
  getOne: (id: string) => api.get<any>(`/exercises/${id}`),
  create: (data: object) => api.post<any>('/exercises', data),
  update: (id: string, data: object) => api.patch<any>(`/exercises/${id}`, data),
  remove: (id: string) => api.delete(`/exercises/${id}`),
};
