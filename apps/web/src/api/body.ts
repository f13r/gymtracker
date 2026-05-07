import { api } from './client';

export const bodyApi = {
  getWeights: () => api.get<any[]>('/body/weight'),
  addWeight: (data: { weightKg: number; notes?: string }) => api.post<any>('/body/weight', data),
  getMeasurements: () => api.get<any[]>('/body/measurements'),
  addMeasurement: (data: object) => api.post<any>('/body/measurements', data),
};
