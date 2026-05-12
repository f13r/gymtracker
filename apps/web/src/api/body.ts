import type { BodyMeasurement, BodyWeight, CreateBodyWeightDto, CreateMeasurementDto } from '@gymtracker/shared'

import { api } from './client'

export const bodyApi = {
  getWeights: () => api.get<BodyWeight[]>('/body/weight'),
  addWeight: (data: CreateBodyWeightDto) => api.post<BodyWeight>('/body/weight', data),
  getMeasurements: () => api.get<BodyMeasurement[]>('/body/measurements'),
  addMeasurement: (data: CreateMeasurementDto) => api.post<BodyMeasurement>('/body/measurements', data),
}
