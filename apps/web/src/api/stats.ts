import { api } from './client';

export const statsApi = {
  getPRs: (exerciseId?: string, limit = 10) => {
    const params = new URLSearchParams();
    if (exerciseId) params.set('exerciseId', exerciseId);
    params.set('limit', String(limit));
    return api.get<any[]>(`/stats/prs?${params}`);
  },
  getVolume: (exerciseId?: string, from?: number, to?: number) => {
    const params = new URLSearchParams();
    if (exerciseId) params.set('exerciseId', exerciseId);
    if (from) params.set('from', String(from));
    if (to) params.set('to', String(to));
    return api.get<any[]>(`/stats/volume?${params}`);
  },
  getStreak: () => api.get<{ current: number; longest: number }>('/stats/streak'),
  getBodyWeight: (from?: number, to?: number) => {
    const params = new URLSearchParams();
    if (from) params.set('from', String(from));
    if (to) params.set('to', String(to));
    return api.get<any[]>(`/stats/bodyweight?${params}`);
  },
  getMeasurements: () => api.get<any[]>('/stats/measurements'),
  getFrequency: () => api.get<any[]>('/stats/frequency'),
};
